import { describe, expect, it } from 'vitest';
import type { StudyCard } from '@/domain/models';
import {
  currentFlashcard,
  flashcardTally,
  isDeckFinished,
  mark,
  startFlashcards,
  toggleShuffle,
} from '@/domain/study/flashcards';
import { buildMatchBoard, formatDuration, isMatch, maxPairsFor } from '@/domain/study/match';

const cards: StudyCard[] = [
  { id: 'a', front: 'one', back: 'uno' },
  { id: 'b', front: 'two', back: 'dos' },
  { id: 'c', front: 'three', back: 'tres' },
  { id: 'd', front: 'One', back: 'eins' }, // duplicate front (case-insensitive)
  { id: 'e', front: '', back: 'empty' },
];

describe('match board', () => {
  it('only uses cards with unique, non-empty sides', () => {
    const tiles = buildMatchBoard(cards, 10, 1);
    const cardIds = new Set(tiles.map((t) => t.cardId));
    expect(cardIds.has('e')).toBe(false);
    expect(cardIds.has('a') && cardIds.has('d')).toBe(false);
    expect(tiles).toHaveLength(cardIds.size * 2);
    expect(maxPairsFor(cards)).toBe(3);
  });

  it('limits to the requested pair count, deterministically', () => {
    expect(buildMatchBoard(cards, 2, 9)).toHaveLength(4);
    expect(buildMatchBoard(cards, 2, 9)).toEqual(buildMatchBoard(cards, 2, 9));
  });

  it('matches a front with its own back only', () => {
    const tiles = buildMatchBoard(cards, 3, 2);
    const front = tiles.find((t) => t.side === 'front') as (typeof tiles)[number];
    const partner = tiles.find(
      (t) => t.cardId === front.cardId && t.side === 'back',
    ) as (typeof tiles)[number];
    const other = tiles.find((t) => t.cardId !== front.cardId) as (typeof tiles)[number];
    expect(isMatch(front, partner)).toBe(true);
    expect(isMatch(front, front)).toBe(false);
    expect(isMatch(front, other)).toBe(false);
  });

  it('formats durations', () => {
    expect(formatDuration(12_345)).toBe('12.3s');
    expect(formatDuration(83_000)).toBe('1:23.0');
  });
});

describe('flashcards session', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('walks through the deck tallying marks', () => {
    let s = startFlashcards(ids, { shuffled: false, reversed: false, filter: 'all', seed: 1 });
    expect(currentFlashcard(s)).toBe('a');
    s = mark(s, true);
    s = mark(s, false);
    s = mark(s, true);
    s = mark(s, true);
    expect(isDeckFinished(s)).toBe(true);
    expect(flashcardTally(s)).toEqual({ known: 3, unknown: 1, total: 4 });
  });

  it('shuffling keeps the current card and finished cards in place', () => {
    let s = startFlashcards(ids, { shuffled: false, reversed: false, filter: 'all', seed: 1 });
    s = mark(s, true);
    const toggled = toggleShuffle(s, ids, 99);
    expect(toggled.order[0]).toBe('a');
    expect(currentFlashcard(toggled)).toBe('b');
    expect([...toggled.order].sort()).toEqual(ids);
  });
});
