import Papa from 'papaparse';
import { normalizeAnswer } from '@/domain/grading/grade';
import type { CardDraft } from '@/services/repositories/cards';

export type ColumnRole = 'front' | 'back' | 'explanation' | 'accepted' | 'ignore';

export interface ImportOptions {
  /** Between term and definition (columns), e.g. "\t", ",", " - ". */
  termSeparator: string;
  /** Between cards (rows), e.g. "\n", ";", "\n\n". */
  cardSeparator: string;
  /** Honour CSV-style "double quotes" (values may then contain separators and line breaks). */
  quoted: boolean;
  /** Skip the first row (column titles). */
  hasHeader: boolean;
  /** Role of each column, left to right. Extra columns are ignored. */
  columns: ColumnRole[];
  /** Separator between alternate answers inside an "accepted" column. */
  acceptedSeparator: string;
  /** Swap term and definition. */
  swap: boolean;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  termSeparator: '\t',
  cardSeparator: '\n',
  quoted: false,
  hasHeader: false,
  columns: ['front', 'back'],
  acceptedSeparator: '|',
  swap: false,
};

export const TERM_SEPARATOR_PRESETS = [
  { id: 'tab', label: 'Tab', value: '\t' },
  { id: 'comma', label: 'Comma', value: ',' },
  { id: 'dash', label: 'Dash ( - )', value: ' - ' },
  { id: 'colon', label: 'Colon', value: ':' },
] as const;

export const CARD_SEPARATOR_PRESETS = [
  { id: 'newline', label: 'New line', value: '\n' },
  { id: 'semicolon', label: 'Semicolon', value: ';' },
  { id: 'blank', label: 'Blank line', value: '\n\n' },
] as const;

export type RowIssue =
  | 'missing_front'
  | 'missing_back'
  | 'duplicate'
  | 'duplicate_existing'
  | 'too_long';

export interface PreviewRow {
  /** 1-based row number in the source (after the header, if any). */
  row: number;
  card: CardDraft;
  issues: RowIssue[];
}

export interface ParseResult {
  rows: PreviewRow[];
  /** Number of columns found in the widest row. */
  columnCount: number;
  /** First data rows as raw cells (for the column-mapping header). */
  sample: string[][];
  /** Parser-level problems (e.g. unbalanced quotes). */
  errors: string[];
}

export const MAX_FIELD_LENGTH = 20_000;

/** Turn user-typed escapes ("\t", "\n") into real characters. */
export function unescapeSeparator(input: string): string {
  return input.replace(/\\t/g, '\t').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
}

/** Human-readable form of a separator for display ("\t" → "\\t"). */
export function escapeSeparator(value: string): string {
  return value.replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

/** Split `s` on `sep` at most `limit - 1` times; the remainder stays in the last part. */
function splitLimit(s: string, sep: string, limit: number): string[] {
  if (!sep || limit <= 1) return [s];
  const parts: string[] = [];
  let rest = s;
  while (parts.length < limit - 1) {
    const i = rest.indexOf(sep);
    if (i < 0) break;
    parts.push(rest.slice(0, i));
    rest = rest.slice(i + sep.length);
  }
  parts.push(rest);
  return parts;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Split text into raw cell rows according to the options. */
export function splitRows(
  input: string,
  opts: ImportOptions,
): { rows: string[][]; errors: string[] } {
  const text = stripBom(input).replace(/\r\n?/g, '\n');
  const termSep = opts.termSeparator;
  const cardSep = opts.cardSeparator;
  if (!termSep) return { rows: [], errors: ['Choose a separator between term and definition.'] };
  if (!cardSep) return { rows: [], errors: ['Choose a separator between cards.'] };

  if (opts.quoted) {
    const parsed = Papa.parse<string[]>(text, {
      delimiter: termSep,
      newline: cardSep as '\n',
      quoteChar: '"',
      skipEmptyLines: 'greedy',
    });
    const errors = parsed.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
    return { rows: parsed.data, errors };
  }

  // Unquoted: split cards, then split each card at the first separator(s) only,
  // so definitions may themselves contain the separator.
  const mapped = Math.max(2, opts.columns.length);
  const records = text.split(cardSep);
  const rows = records
    .map((r) => (cardSep === '\n' ? r : r.replace(/^\n+|\n+$/g, '')))
    .filter((r) => r.trim().length > 0)
    .map((r) => splitLimit(r, termSep, mapped));
  return { rows, errors: [] };
}

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

/** Parse text into preview rows. `existing` = cards already in the target set, for duplicate detection. */
export function parseImport(
  input: string,
  opts: ImportOptions,
  existing: readonly { front: string; back: string }[] = [],
): ParseResult {
  const { rows: raw, errors } = splitRows(input, opts);
  const dataRows = opts.hasHeader ? raw.slice(1) : raw;
  const columnCount = raw.reduce((m, r) => Math.max(m, r.length), 0);
  const key = (front: string, back: string) =>
    `${normalizeAnswer(front)}\u0000${normalizeAnswer(back)}`;
  const existingKeys = new Set(existing.map((c) => key(c.front, c.back)));
  const seen = new Set<string>();

  const rows: PreviewRow[] = dataRows.map((cells, i) => {
    const card: CardDraft = { front: '', back: '', explanation: '', acceptedAnswers: [] };
    opts.columns.forEach((role, col) => {
      const value = clean(cells[col]);
      if (!value || role === 'ignore') return;
      if (role === 'accepted') {
        const alts = opts.acceptedSeparator ? value.split(opts.acceptedSeparator) : [value];
        card.acceptedAnswers = [
          ...(card.acceptedAnswers ?? []),
          ...alts.map((a) => a.trim()).filter(Boolean),
        ];
      } else if (role === 'explanation') {
        card.explanation = card.explanation ? `${card.explanation}\n${value}` : value;
      } else {
        card[role] = card[role] ? `${card[role]} ${value}` : value;
      }
    });
    if (opts.swap) [card.front, card.back] = [card.back, card.front];

    const issues: RowIssue[] = [];
    if (!card.front) issues.push('missing_front');
    if (!card.back) issues.push('missing_back');
    if ([card.front, card.back, card.explanation ?? ''].some((v) => v.length > MAX_FIELD_LENGTH))
      issues.push('too_long');
    if (card.front || card.back) {
      const k = key(card.front, card.back);
      if (existingKeys.has(k)) issues.push('duplicate_existing');
      else if (seen.has(k)) issues.push('duplicate');
      seen.add(k);
    }
    return { row: i + 1, card, issues };
  });

  return { rows, columnCount, sample: dataRows.slice(0, 3), errors };
}

export interface ImportSelection {
  skipDuplicates: boolean;
  skipIncomplete: boolean;
}

/** Rows that will actually be imported. Rows with no content at all are always dropped. */
export function selectRows(result: ParseResult, sel: ImportSelection): PreviewRow[] {
  return result.rows.filter((r) => {
    if (r.issues.includes('too_long')) return false;
    if (!r.card.front && !r.card.back) return false;
    if (
      sel.skipIncomplete &&
      (r.issues.includes('missing_front') || r.issues.includes('missing_back'))
    )
      return false;
    if (
      sel.skipDuplicates &&
      (r.issues.includes('duplicate') || r.issues.includes('duplicate_existing'))
    )
      return false;
    return true;
  });
}

/**
 * Guess sensible options from the content. Cards: blank lines between
 * multi-line blocks, semicolons when the text is one long line, otherwise new
 * lines. Terms: tab, else comma (or a .csv file), else " - ", else ":".
 */
export function detectOptions(input: string, fileName?: string): ImportOptions {
  const text = stripBom(input).replace(/\r\n?/g, '\n');
  const ext = fileName?.toLowerCase().split('.').pop();
  const lines = text.split('\n').filter((l) => l.trim());

  let cardSeparator = '\n';
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
  const semis = text.split(';').filter((b) => b.trim());
  if (ext !== 'csv' && ext !== 'tsv' && semis.length >= 3 && lines.length * 2 <= semis.length)
    cardSeparator = ';';
  else if (
    blocks.length > 1 &&
    blocks.length * 1.5 < lines.length &&
    blocks.every((b) => b.trim().includes('\n'))
  ) {
    cardSeparator = '\n\n';
  }

  const units = (cardSeparator === '\n' ? lines : text.split(cardSeparator))
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 50);
  const share = (pred: (u: string) => boolean) =>
    units.length ? units.filter(pred).length / units.length : 0;
  let termSeparator = '\t';
  if (ext === 'tsv' || share((u) => u.includes('\t')) >= 0.5) termSeparator = '\t';
  else if (ext === 'csv' || share((u) => u.includes(',')) >= 0.8) termSeparator = ',';
  else if (share((u) => u.includes(' - ')) >= 0.5) termSeparator = ' - ';
  else if (share((u) => u.includes(':')) >= 0.5) termSeparator = ':';
  else if (cardSeparator === '\n\n') termSeparator = '\n';

  const quoted = (ext === 'csv' || ext === 'tsv' || termSeparator === ',') && text.includes('"');
  const opts: ImportOptions = { ...DEFAULT_IMPORT_OPTIONS, termSeparator, cardSeparator, quoted };

  const { rows } = splitRows(text, {
    ...opts,
    columns: ['front', 'back', 'explanation', 'accepted'],
  });
  const width = rows.slice(0, 20).reduce((m, r) => Math.max(m, r.length), 0);
  if (quoted || termSeparator === '\t') {
    opts.columns = (['front', 'back', 'explanation', 'accepted'] as ColumnRole[]).slice(
      0,
      Math.max(2, Math.min(width, 4)),
    );
    for (let i = opts.columns.length; i < width; i++) opts.columns.push('ignore');
  }
  return opts;
}
