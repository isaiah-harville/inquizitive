export function currentStreak(
  activeDays: ReadonlySet<string>,
  today: string,
  dayBefore: (day: string) => string,
): number {
  let day = activeDays.has(today) ? today : dayBefore(today);
  let streak = 0;
  while (activeDays.has(day)) {
    streak++;
    day = dayBefore(day);
  }
  return streak;
}

export function longestStreak(days: readonly string[], dayBefore: (day: string) => string): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && dayBefore(sorted[i]) === sorted[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** "YYYY-MM-DD" → previous calendar day (UTC math on a date-only value is DST-safe). */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
  return t.toISOString().slice(0, 10);
}
