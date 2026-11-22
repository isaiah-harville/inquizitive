import { describe, expect, it } from 'vitest';
import { FsrsState, ReviewRating } from '@/domain/models';
import {
  createScheduler,
  formatInterval,
  isDue,
  parseSchedulingCard,
} from '@/domain/scheduling/fsrs';

const DAY = 86_400_000;
const MINUTE = 60_000;
const t0 = Date.UTC(2026, 0, 1, 9, 0, 0);

describe('FSRS scheduling', () => {
  const s = createScheduler({ enableFuzz: false });

  it('creates a new card due immediately', () => {
    const c = s.newCard(t0);
    expect(c.state).toBe(FsrsState.New);
    expect(c.due).toBe(t0);
    expect(isDue(c, t0)).toBe(true);
    expect(c.reps).toBe(0);
  });

  it('moves New → Learning with a short step on Good', () => {
    const { card, stateBefore } = s.review(s.newCard(t0), ReviewRating.Good, t0);
    expect(stateBefore).toBe(FsrsState.New);
    expect(card.state).toBe(FsrsState.Learning);
    expect(card.due - t0).toBe(10 * MINUTE);
    expect(card.reps).toBe(1);
    expect(card.lastReview).toBe(t0);
  });

  it('graduates to Review with a multi-day interval on Easy', () => {
    const { card, intervalDays } = s.review(s.newCard(t0), ReviewRating.Easy, t0);
    expect(card.state).toBe(FsrsState.Review);
    expect(intervalDays).toBeGreaterThanOrEqual(1);
  });

  it('orders intervals Again < Hard < Good < Easy for a review card', () => {
    let card = s.review(s.newCard(t0), ReviewRating.Easy, t0).card;
    const now = card.due;
    const p = s.preview(card, now);
    expect(p[ReviewRating.Again]).toBeLessThan(p[ReviewRating.Hard]);
    expect(p[ReviewRating.Hard]).toBeLessThan(p[ReviewRating.Good]);
    expect(p[ReviewRating.Good]).toBeLessThan(p[ReviewRating.Easy]);
    const first = card.due - t0;
    card = s.review(card, ReviewRating.Good, now).card;
    expect(card.due - now).toBeGreaterThan(first);
  });

  it('counts a lapse and relearns on Again after review', () => {
    const graduated = s.review(s.newCard(t0), ReviewRating.Easy, t0).card;
    const { card } = s.review(graduated, ReviewRating.Again, graduated.due);
    expect(card.state).toBe(FsrsState.Relearning);
    expect(card.lapses).toBe(1);
    expect(card.due - graduated.due).toBeLessThan(DAY);
  });

  it('is deterministic without fuzz', () => {
    const a = s.review(s.newCard(t0), ReviewRating.Good, t0);
    const b = s.review(s.newCard(t0), ReviewRating.Good, t0);
    expect(a).toEqual(b);
  });

  it('handles reviewing an overdue card', () => {
    const graduated = s.review(s.newCard(t0), ReviewRating.Easy, t0).card;
    const late = graduated.due + 30 * DAY;
    const { card } = s.review(graduated, ReviewRating.Good, late);
    expect(card.due).toBeGreaterThan(late);
    expect(card.state).toBe(FsrsState.Review);
  });

  it('serializes through JSON', () => {
    const c = s.review(s.newCard(t0), ReviewRating.Good, t0).card;
    expect(parseSchedulingCard(JSON.stringify(c))).toEqual(c);
    expect(parseSchedulingCard('not json')).toBeNull();
    expect(parseSchedulingCard(null)).toBeNull();
  });

  it('reports higher retrievability right after review than much later', () => {
    const c = s.review(s.newCard(t0), ReviewRating.Easy, t0).card;
    expect(s.retrievability(c, t0 + DAY)).toBeGreaterThan(s.retrievability(c, t0 + 100 * DAY));
  });
});

describe('formatInterval', () => {
  it('formats across units', () => {
    expect(formatInterval(10 * MINUTE)).toBe('10m');
    expect(formatInterval(3 * 3_600_000)).toBe('3h');
    expect(formatInterval(4 * DAY)).toBe('4d');
    expect(formatInterval(65 * DAY)).toBe('2mo');
    expect(formatInterval(400 * DAY)).toBe('1.1y');
  });
});
