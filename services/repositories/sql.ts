import type { Dialect } from '@/services/db/driver';

/** Separator for aggregated lists (ASCII unit separator: never typed by users). */
export const LIST_SEP = '\u001f';

/** Aggregate a column into a LIST_SEP-joined string. */
export function listAgg(dialect: Dialect, expr: string): string {
  return dialect === 'postgres'
    ? `string_agg(${expr}, chr(31))`
    : `group_concat(${expr}, char(31))`;
}

export function splitList(value: unknown): string[] {
  return typeof value === 'string' && value.length > 0 ? value.split(LIST_SEP) : [];
}

export function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

export function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}
