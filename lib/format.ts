export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function relativeTime(ms: number | null | undefined, now = Date.now()): string {
  if (!ms) return 'never';
  const diff = now - ms;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, size] of units) {
    if (abs >= size) return rtf.format(-Math.round(diff / size), unit);
  }
  return 'just now';
}

export function startOfDay(at = new Date()): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(at = new Date()): number {
  return startOfDay(at) + 86_400_000 - 1;
}

/** Offset to add to UTC epoch ms to get local wall-clock ms. */
export function tzOffsetMs(at = new Date()): number {
  return -at.getTimezoneOffset() * 60_000;
}

export function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const MODE_LABELS = {
  flashcards: 'Flashcards',
  learn: 'Learn',
  test: 'Test',
  match: 'Match',
  review: 'Review',
} as const;
