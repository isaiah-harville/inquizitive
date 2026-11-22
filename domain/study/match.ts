import { normalizeAnswer } from '@/domain/grading/grade';
import type { CardSide, Id, StudyCard } from '@/domain/models';
import { createRng, shuffle } from '@/domain/random';

export interface MatchTile {
  id: string;
  cardId: Id;
  side: CardSide;
  text: string;
}

export const MIN_PAIRS = 2;
export const MAX_PAIRS = 12;

/**
 * Pick `pairCount` cards whose fronts and backs are each unique (so every
 * tile has exactly one partner) and lay them out in random order.
 */
export function buildMatchBoard(
  cards: readonly StudyCard[],
  pairCount: number,
  seed: number,
): MatchTile[] {
  const rng = createRng(seed);
  const fronts = new Set<string>();
  const backs = new Set<string>();
  const chosen: StudyCard[] = [];
  for (const card of shuffle(cards, rng)) {
    const f = normalizeAnswer(card.front);
    const b = normalizeAnswer(card.back);
    if (!f || !b || fronts.has(f) || backs.has(b)) continue;
    fronts.add(f);
    backs.add(b);
    chosen.push(card);
    if (chosen.length >= pairCount) break;
  }
  const tiles = chosen.flatMap<MatchTile>((c) => [
    { id: `${c.id}:front`, cardId: c.id, side: 'front', text: c.front },
    { id: `${c.id}:back`, cardId: c.id, side: 'back', text: c.back },
  ]);
  return shuffle(tiles, rng);
}

export function isMatch(a: MatchTile, b: MatchTile): boolean {
  return a.cardId === b.cardId && a.side !== b.side;
}

/** Cards that can participate in a match board (unique, non-empty sides). */
export function maxPairsFor(cards: readonly StudyCard[]): number {
  return Math.min(MAX_PAIRS, buildMatchBoard(cards, MAX_PAIRS, 1).length / 2);
}

export function formatDuration(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
    : `${seconds}.${tenths}s`;
}
