import { describe, expect, it } from 'vitest';
import { currentStreak, longestStreak, previousDay } from '@/domain/stats';

describe('streaks', () => {
  it('computes the previous day across month/year and DST boundaries', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
    expect(previousDay('2026-03-09')).toBe('2026-03-08');
  });

  it('counts a streak ending today or yesterday', () => {
    const days = new Set(['2026-05-01', '2026-05-02', '2026-05-03']);
    expect(currentStreak(days, '2026-05-03', previousDay)).toBe(3);
    expect(currentStreak(days, '2026-05-04', previousDay)).toBe(3);
    expect(currentStreak(days, '2026-05-05', previousDay)).toBe(0);
    expect(currentStreak(new Set(), '2026-05-05', previousDay)).toBe(0);
  });

  it('finds the longest run', () => {
    expect(
      longestStreak(
        ['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'],
        previousDay,
      ),
    ).toBe(3);
    expect(longestStreak([], previousDay)).toBe(0);
  });
});
