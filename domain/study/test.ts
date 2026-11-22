import { gradeWritten } from '@/domain/grading/grade';
import type { Id, QuestionType, StudyCard } from '@/domain/models';
import { createRng, hashSeed, shuffle } from '@/domain/random';
import {
  type AnswerDirection,
  buildCardQuestion,
  buildMatching,
  type CardQuestion,
  isChoiceCorrect,
  type MatchingQuestion,
  type Question,
  resolveAnswerSide,
} from './questions';

export interface TestConfig {
  /** Number of cards to test (each card appears once). */
  questionCount: number;
  types: QuestionType[];
  direction: AnswerDirection;
  randomize: boolean;
  /** Restrict to these cards; undefined = all. */
  cardIds?: Id[];
  revealImmediately: boolean;
}

export const DEFAULT_TEST_CONFIG: TestConfig = {
  questionCount: 20,
  types: ['multiple_choice', 'true_false', 'written', 'matching'],
  direction: 'back',
  randomize: true,
  revealImmediately: false,
};

export const MATCHING_GROUP_SIZE = 5;

/** Responses: card-question → string; matching → { itemCardId: optionCardId }. */
export type TestResponse = string | Record<Id, Id>;

export function buildTest(
  cards: readonly StudyCard[],
  config: TestConfig,
  seed: number,
): Question[] {
  if (config.types.length === 0) throw new Error('Pick at least one question type');
  const rng = createRng(seed);
  const subset = config.cardIds
    ? cards.filter((c) => config.cardIds?.includes(c.id))
    : cards.slice();
  const ordered = config.randomize ? shuffle(subset, rng) : subset;
  const chosen = ordered.slice(0, Math.max(0, Math.floor(config.questionCount)));

  const typeCycle = config.randomize ? shuffle(config.types, rng) : config.types.slice();
  const assigned = chosen.map((card, i) => ({ card, type: typeCycle[i % typeCycle.length] }));
  const assignments = config.randomize ? shuffle(assigned, rng) : assigned;

  const matchingCards = assignments.filter((a) => a.type === 'matching').map((a) => a.card);
  const questions: Question[] = [];
  const fallbackType = config.types.find((t) => t !== 'matching') ?? 'written';

  // Group matching cards; a group of one cannot be matched, so it falls back.
  const groups: StudyCard[][] = [];
  for (let i = 0; i < matchingCards.length; i += MATCHING_GROUP_SIZE) {
    groups.push(matchingCards.slice(i, i + MATCHING_GROUP_SIZE));
  }
  const leftovers =
    groups.length && groups[groups.length - 1].length < 2 ? (groups.pop() ?? []) : [];

  for (const { card, type } of assignments) {
    if (type === 'matching') continue;
    questions.push(singleQuestion(type, card, cards, config, seed));
  }
  for (const card of leftovers)
    questions.push(singleQuestion(fallbackType, card, cards, config, seed));
  groups.forEach((group, i) => {
    const side = resolveAnswerSide(
      config.direction === 'both' ? 'back' : config.direction,
      group[0].id,
      seed,
    );
    questions.push(
      buildMatching(group, { side, rng: createRng(hashSeed(seed, 'match', i)), idPrefix: `t${i}` }),
    );
  });
  return questions;
}

function singleQuestion(
  type: QuestionType,
  card: StudyCard,
  pool: readonly StudyCard[],
  config: TestConfig,
  seed: number,
): CardQuestion {
  const t = type === 'matching' ? 'written' : type;
  const side = resolveAnswerSide(config.direction, card.id, seed);
  return buildCardQuestion(t, card, pool, {
    side,
    rng: createRng(hashSeed(seed, card.id, t)),
    idPrefix: 't',
  });
}

export interface QuestionResult {
  questionId: string;
  /** 0..1 (matching questions can be partially correct). */
  score: number;
  correct: boolean;
  /** For matching: per-item correctness. */
  itemResults?: Record<Id, boolean>;
  /** Written answers that were accepted with a typo. */
  almost?: boolean;
}

export function gradeQuestion(
  question: Question,
  response: TestResponse | undefined,
): QuestionResult {
  if (question.type === 'matching') return gradeMatching(question, response);
  if (typeof response !== 'string' || response.trim() === '') {
    return { questionId: question.id, score: 0, correct: false };
  }
  if (question.type === 'written') {
    const g = gradeWritten(response, question.acceptedAnswers);
    return {
      questionId: question.id,
      score: g.correct ? 1 : 0,
      correct: g.correct,
      almost: g.verdict === 'almost',
    };
  }
  const correct = isChoiceCorrect(question, response);
  return { questionId: question.id, score: correct ? 1 : 0, correct };
}

function gradeMatching(
  question: MatchingQuestion,
  response: TestResponse | undefined,
): QuestionResult {
  const pairs = typeof response === 'object' && response ? response : {};
  const itemResults: Record<Id, boolean> = {};
  // Accept an option whose text equals the expected one (duplicate answers in a set).
  const textByCard = new Map(question.options.map((o) => [o.cardId, o.text.trim()]));
  for (const item of question.items) {
    const chosen = pairs[item.cardId];
    itemResults[item.cardId] =
      chosen !== undefined &&
      (chosen === item.cardId || textByCard.get(chosen) === textByCard.get(item.cardId));
  }
  const right = Object.values(itemResults).filter(Boolean).length;
  const score = question.items.length ? right / question.items.length : 0;
  return { questionId: question.id, score, correct: score === 1, itemResults };
}

export interface TestSummary {
  results: QuestionResult[];
  score: number;
  maxScore: number;
  percent: number;
  /** Card ids answered incorrectly (for "retry missed"). */
  missedCardIds: Id[];
}

export function gradeTest(
  questions: readonly Question[],
  responses: Readonly<Record<string, TestResponse>>,
): TestSummary {
  const results = questions.map((q) => gradeQuestion(q, responses[q.id]));
  const missed = new Set<Id>();
  questions.forEach((q, i) => {
    const r = results[i];
    if (q.type === 'matching') {
      for (const [cardId, ok] of Object.entries(r.itemResults ?? {})) if (!ok) missed.add(cardId);
    } else if (!r.correct) {
      missed.add(q.cardId);
    }
  });
  const score = results.reduce((s, r) => s + r.score, 0);
  const maxScore = questions.length;
  return {
    results,
    score,
    maxScore,
    percent: maxScore === 0 ? 0 : Math.round((score / maxScore) * 100),
    missedCardIds: [...missed],
  };
}
