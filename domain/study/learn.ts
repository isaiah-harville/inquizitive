import type { Id, QuestionType, StudyCard } from '@/domain/models';
import { createRng, hashSeed, pick, shuffle } from '@/domain/random';
import {
  type AnswerDirection,
  buildCardQuestion,
  type CardQuestion,
  resolveAnswerSide,
} from './questions';

export type LearnQuestionType = Exclude<QuestionType, 'matching'>;

export const MASTERY_LEVEL = 2;
/** Re-ask a missed card after this many other questions (if available). */
export const RETRY_GAP = 2;

/** Ordered easiest → hardest. */
export const LEARN_TYPE_DIFFICULTY: readonly LearnQuestionType[] = [
  'true_false',
  'multiple_choice',
  'flashcard',
  'written',
];

export interface LearnSettings {
  questionTypes: LearnQuestionType[];
  direction: AnswerDirection;
  roundSize: number;
}

export const DEFAULT_LEARN_SETTINGS: LearnSettings = {
  questionTypes: ['multiple_choice', 'written'],
  direction: 'back',
  roundSize: 7,
};

export interface LearnCardState {
  level: number;
  attempts: number;
  misses: number;
}

export interface LearnState {
  version: 1;
  seed: number;
  settings: LearnSettings;
  /** Introduction order. */
  cardIds: Id[];
  cards: Record<Id, LearnCardState>;
  round: number;
  roundCardIds: Id[];
  /** Card ids still to be asked this round (head = current). */
  queue: Id[];
  /** First-attempt result for each card in this round. */
  roundResults: Record<Id, boolean>;
  /** Total questions asked; feeds question seeding. */
  step: number;
  completed: boolean;
}

export function startLearn(
  cardIds: readonly Id[],
  settings: LearnSettings,
  seed: number,
): LearnState {
  if (settings.questionTypes.length === 0)
    throw new Error('Learn needs at least one question type');
  const rng = createRng(seed);
  const order = shuffle(cardIds, rng);
  const state: LearnState = {
    version: 1,
    seed,
    settings: { ...settings, roundSize: Math.max(1, Math.floor(settings.roundSize)) },
    cardIds: order,
    cards: Object.fromEntries(order.map((id) => [id, { level: 0, attempts: 0, misses: 0 }])),
    round: 0,
    roundCardIds: [],
    queue: [],
    roundResults: {},
    step: 0,
    completed: order.length === 0,
  };
  return state.completed ? state : nextRound(state);
}

/** Cards still to master, most urgent first: missed, then in progress, then new. */
function roundCandidates(state: LearnState): Id[] {
  const open = state.cardIds.filter((id) => state.cards[id].level < MASTERY_LEVEL);
  const rank = (id: Id) => {
    const c = state.cards[id];
    if (c.attempts > 0 && c.misses > 0) return 0;
    if (c.attempts > 0) return 1;
    return 2;
  };
  // Stable sort keeps introduction order within each rank.
  return open
    .map((id, i) => ({ id, i, r: rank(id) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
}

/** Start the next round, or mark the session complete when everything is mastered. */
export function nextRound(state: LearnState): LearnState {
  const candidates = roundCandidates(state);
  if (candidates.length === 0) {
    return { ...state, queue: [], roundCardIds: [], completed: true };
  }
  const roundCardIds = candidates.slice(0, state.settings.roundSize);
  const rng = createRng(hashSeed(state.seed, 'round', state.round + 1));
  return {
    ...state,
    round: state.round + 1,
    roundCardIds,
    queue: shuffle(roundCardIds, rng),
    roundResults: {},
    completed: false,
  };
}

export function currentCardId(state: LearnState): Id | null {
  return state.queue[0] ?? null;
}

export function isRoundComplete(state: LearnState): boolean {
  return !state.completed && state.queue.length === 0;
}

/** Choose a question type appropriate to the card's mastery level. */
export function questionTypeFor(state: LearnState, cardId: Id): LearnQuestionType {
  const enabled = LEARN_TYPE_DIFFICULTY.filter((t) => state.settings.questionTypes.includes(t));
  if (enabled.length === 1) return enabled[0];
  const level = state.cards[cardId]?.level ?? 0;
  const easy = enabled.filter((t) => t === 'true_false' || t === 'multiple_choice');
  const hard = enabled.filter((t) => t === 'flashcard' || t === 'written');
  const pool = level === 0 ? (easy.length ? easy : hard) : hard.length ? hard : easy;
  const rng = createRng(hashSeed(state.seed, cardId, state.step));
  return pick(pool, rng);
}

/** Build the question for the current card. `pool` is every card in the set (for distractors). */
export function currentQuestion(
  state: LearnState,
  cardsById: ReadonlyMap<Id, StudyCard>,
  pool: readonly StudyCard[],
): CardQuestion | null {
  const cardId = currentCardId(state);
  if (!cardId) return null;
  const card = cardsById.get(cardId);
  if (!card) return null;
  const type = questionTypeFor(state, cardId);
  const side = resolveAnswerSide(state.settings.direction, cardId, state.seed);
  const rng = createRng(hashSeed(state.seed, 'q', cardId, state.step));
  return buildCardQuestion(type, card, pool, { side, rng, idPrefix: `learn${state.step}` });
}

/** Record an answer to the current card and advance. */
export function answerLearn(state: LearnState, correct: boolean): LearnState {
  const cardId = currentCardId(state);
  if (!cardId) return state;
  const prev = state.cards[cardId];
  const card: LearnCardState = {
    attempts: prev.attempts + 1,
    misses: prev.misses + (correct ? 0 : 1),
    level: correct ? Math.min(MASTERY_LEVEL, prev.level + 1) : Math.max(0, prev.level - 1),
  };
  const rest = state.queue.slice(1);
  const queue = correct ? rest : [...rest.slice(0, RETRY_GAP), cardId, ...rest.slice(RETRY_GAP)];
  return {
    ...state,
    cards: { ...state.cards, [cardId]: card },
    queue,
    roundResults:
      cardId in state.roundResults
        ? state.roundResults
        : { ...state.roundResults, [cardId]: correct },
    step: state.step + 1,
  };
}

export interface LearnProgress {
  total: number;
  mastered: number;
  familiar: number;
  fresh: number;
  /** 0..1, counts familiar cards as half-way. */
  ratio: number;
}

export function learnProgress(state: LearnState): LearnProgress {
  let mastered = 0;
  let familiar = 0;
  for (const id of state.cardIds) {
    const level = state.cards[id].level;
    if (level >= MASTERY_LEVEL) mastered++;
    else if (level > 0) familiar++;
  }
  const total = state.cardIds.length;
  return {
    total,
    mastered,
    familiar,
    fresh: total - mastered - familiar,
    ratio: total === 0 ? 1 : (mastered + familiar / 2) / total,
  };
}
