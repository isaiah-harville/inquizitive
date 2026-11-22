import type { Id } from '@/domain/models';
import { createRng, shuffle } from '@/domain/random';

export type FlashcardFilter = 'all' | 'starred' | 'unknown';

export interface FlashcardsState {
  version: 1;
  order: Id[];
  index: number;
  shuffled: boolean;
  /** Show the back first. */
  reversed: boolean;
  filter: FlashcardFilter;
  marks: Record<Id, 'known' | 'unknown'>;
  seed: number;
}

export function startFlashcards(
  cardIds: readonly Id[],
  opts: { shuffled: boolean; reversed: boolean; filter: FlashcardFilter; seed: number },
): FlashcardsState {
  return {
    version: 1,
    order: opts.shuffled ? shuffle(cardIds, createRng(opts.seed)) : cardIds.slice(),
    index: 0,
    shuffled: opts.shuffled,
    reversed: opts.reversed,
    filter: opts.filter,
    marks: {},
    seed: opts.seed,
  };
}

export function currentFlashcard(state: FlashcardsState): Id | null {
  return state.order[state.index] ?? null;
}

export function isDeckFinished(state: FlashcardsState): boolean {
  return state.index >= state.order.length;
}

export function goTo(state: FlashcardsState, index: number): FlashcardsState {
  return { ...state, index: Math.max(0, Math.min(state.order.length, index)) };
}

export function mark(state: FlashcardsState, known: boolean): FlashcardsState {
  const id = currentFlashcard(state);
  if (!id) return state;
  return {
    ...state,
    marks: { ...state.marks, [id]: known ? 'known' : 'unknown' },
    index: state.index + 1,
  };
}

/** Toggle shuffle, keeping the current card in place and reordering the rest. */
export function toggleShuffle(
  state: FlashcardsState,
  cardIds: readonly Id[],
  seed: number,
): FlashcardsState {
  const current = currentFlashcard(state);
  const shuffled = !state.shuffled;
  const base = shuffled ? shuffle(cardIds, createRng(seed)) : cardIds.slice();
  if (!current) return { ...state, shuffled, order: base, index: 0, seed };
  const done = state.order.slice(0, state.index);
  const remaining = base.filter((id) => id !== current && !done.includes(id));
  return { ...state, shuffled, seed, order: [...done, current, ...remaining], index: done.length };
}

export function flashcardTally(state: FlashcardsState) {
  let known = 0;
  let unknown = 0;
  for (const v of Object.values(state.marks)) {
    if (v === 'known') known++;
    else unknown++;
  }
  return { known, unknown, total: state.order.length };
}
