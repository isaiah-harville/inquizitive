import { acceptedAnswersFor, normalizeAnswer, sameAnswer } from '@/domain/grading/grade';
import type { CardSide, Id, QuestionType, StudyCard } from '@/domain/models';
import { createRng, hashSeed, type Rng, shuffle } from '@/domain/random';

/** Which side the learner is asked to produce. */
export type AnswerDirection = 'back' | 'front' | 'both';

interface QuestionBase {
  /** Stable id: unique within a session/test. */
  id: string;
  cardId: Id;
  /** Text shown to the learner. */
  prompt: string;
  /** Side of the card the learner must produce. */
  answerSide: CardSide;
  /** Canonical correct answer text. */
  answer: string;
  explanation?: string;
}

export interface MultipleChoiceQuestion extends QuestionBase {
  type: 'multiple_choice';
  choices: { id: string; text: string }[];
  correctChoiceId: string;
}

export interface TrueFalseQuestion extends QuestionBase {
  type: 'true_false';
  /** The answer shown alongside the prompt; may be wrong. */
  shown: string;
  isTrue: boolean;
}

export interface WrittenQuestion extends QuestionBase {
  type: 'written';
  acceptedAnswers: string[];
}

export interface FlashcardQuestion extends QuestionBase {
  type: 'flashcard';
}

export interface MatchingQuestion {
  id: string;
  type: 'matching';
  /** Each prompt must be matched with exactly one option. */
  items: { cardId: Id; prompt: string }[];
  options: { cardId: Id; text: string }[];
}

export type CardQuestion =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | WrittenQuestion
  | FlashcardQuestion;
export type Question = CardQuestion | MatchingQuestion;

export function sideText(card: StudyCard, side: CardSide): string {
  return side === 'front' ? card.front : card.back;
}

export function otherSide(side: CardSide): CardSide {
  return side === 'front' ? 'back' : 'front';
}

/** Resolve "both" into a concrete side, stably per card. */
export function resolveAnswerSide(direction: AnswerDirection, cardId: Id, seed: number): CardSide {
  if (direction !== 'both') return direction;
  return hashSeed(seed, cardId) % 2 === 0 ? 'back' : 'front';
}

/** Accepted answers depend on which side is asked for. */
export function acceptedAnswersForSide(card: StudyCard, side: CardSide): string[] {
  return side === 'back' ? acceptedAnswersFor(card) : [card.front];
}

function looksNumeric(text: string): boolean {
  return /^[\d\s.,:/%$€£+\-eE^]+$/.test(text.trim());
}

/**
 * Pick up to `count` plausible wrong answers for `card` from `pool`.
 * Candidates that equal any accepted answer (after normalization) or each
 * other are discarded; similar-looking answers (length, numeric-ness) are
 * preferred so options are not trivially eliminated.
 */
export function pickDistractors(
  card: StudyCard,
  side: CardSide,
  pool: readonly StudyCard[],
  count: number,
  rng: Rng,
): string[] {
  const correct = acceptedAnswersForSide(card, side);
  const target = sideText(card, side);
  const seen = new Set(correct.map(normalizeAnswer));
  const candidates: { text: string; score: number }[] = [];

  for (const other of pool) {
    if (other.id === card.id) continue;
    const text = sideText(other, side).trim();
    if (!text) continue;
    const key = normalizeAnswer(text);
    if (seen.has(key) || correct.some((c) => sameAnswer(c, text))) continue;
    seen.add(key);
    const lengthRatio = Math.abs(Math.log((text.length + 1) / (target.length + 1)));
    const kindPenalty = looksNumeric(text) === looksNumeric(target) ? 0 : 1.5;
    candidates.push({ text, score: lengthRatio + kindPenalty + rng() * 0.75 });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, count).map((c) => c.text);
}

export interface BuildOptions {
  side: CardSide;
  rng: Rng;
  /** Prefix for generated ids. */
  idPrefix?: string;
}

export function buildMultipleChoice(
  card: StudyCard,
  pool: readonly StudyCard[],
  { side, rng, idPrefix = 'q' }: BuildOptions,
  optionCount = 4,
): MultipleChoiceQuestion | null {
  const distractors = pickDistractors(card, side, pool, optionCount - 1, rng);
  if (distractors.length === 0) return null;
  const answer = sideText(card, side);
  const id = `${idPrefix}:${card.id}:mc`;
  const choices = shuffle(
    [
      { id: `${id}:0`, text: answer },
      ...distractors.map((text, i) => ({ id: `${id}:${i + 1}`, text })),
    ],
    rng,
  );
  return {
    id,
    type: 'multiple_choice',
    cardId: card.id,
    prompt: sideText(card, otherSide(side)),
    answerSide: side,
    answer,
    explanation: card.explanation || undefined,
    choices,
    correctChoiceId: `${id}:0`,
  };
}

export function buildTrueFalse(
  card: StudyCard,
  pool: readonly StudyCard[],
  { side, rng, idPrefix = 'q' }: BuildOptions,
): TrueFalseQuestion {
  const answer = sideText(card, side);
  const [distractor] = rng() < 0.5 ? pickDistractors(card, side, pool, 1, rng) : [];
  return {
    id: `${idPrefix}:${card.id}:tf`,
    type: 'true_false',
    cardId: card.id,
    prompt: sideText(card, otherSide(side)),
    answerSide: side,
    answer,
    explanation: card.explanation || undefined,
    shown: distractor ?? answer,
    isTrue: distractor === undefined,
  };
}

export function buildWritten(
  card: StudyCard,
  { side, idPrefix = 'q' }: Omit<BuildOptions, 'rng'>,
): WrittenQuestion {
  return {
    id: `${idPrefix}:${card.id}:wr`,
    type: 'written',
    cardId: card.id,
    prompt: sideText(card, otherSide(side)),
    answerSide: side,
    answer: sideText(card, side),
    explanation: card.explanation || undefined,
    acceptedAnswers: acceptedAnswersForSide(card, side),
  };
}

export function buildFlashcard(
  card: StudyCard,
  { side, idPrefix = 'q' }: Omit<BuildOptions, 'rng'>,
): FlashcardQuestion {
  return {
    id: `${idPrefix}:${card.id}:fc`,
    type: 'flashcard',
    cardId: card.id,
    prompt: sideText(card, otherSide(side)),
    answerSide: side,
    answer: sideText(card, side),
    explanation: card.explanation || undefined,
  };
}

export function buildMatching(
  cards: readonly StudyCard[],
  { side, rng, idPrefix = 'q' }: BuildOptions,
): MatchingQuestion {
  const items = cards.map((c) => ({ cardId: c.id, prompt: sideText(c, otherSide(side)) }));
  const options = shuffle(
    cards.map((c) => ({ cardId: c.id, text: sideText(c, side) })),
    rng,
  );
  return {
    id: `${idPrefix}:match:${cards.map((c) => c.id).join(',')}`,
    type: 'matching',
    items,
    options,
  };
}

/**
 * Build a question of the requested type, falling back to an easier type
 * when the set cannot support it (e.g. a 1-card set has no distractors).
 */
export function buildCardQuestion(
  type: Exclude<QuestionType, 'matching'>,
  card: StudyCard,
  pool: readonly StudyCard[],
  opts: BuildOptions,
): CardQuestion {
  switch (type) {
    case 'multiple_choice':
      return buildMultipleChoice(card, pool, opts) ?? buildWritten(card, opts);
    case 'true_false':
      return buildTrueFalse(card, pool, opts);
    case 'written':
      return buildWritten(card, opts);
    case 'flashcard':
      return buildFlashcard(card, opts);
  }
}

/** Is this response to a non-written question correct? */
export function isChoiceCorrect(question: CardQuestion, response: string): boolean {
  switch (question.type) {
    case 'multiple_choice':
      return response === question.correctChoiceId;
    case 'true_false':
      return (response === 'true') === question.isTrue;
    case 'flashcard':
      return response === 'known';
    case 'written':
      throw new Error('written answers are graded with gradeWritten');
  }
}

export { createRng };
