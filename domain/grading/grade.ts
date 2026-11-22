export type Verdict = 'correct' | 'almost' | 'incorrect';

export interface GradeResult {
  verdict: Verdict;
  /** True for both "correct" and "almost" (a typo still counts). */
  correct: boolean;
  /** The accepted answer the response matched most closely. */
  expected: string;
  /** Edit distance to `expected` after normalization. */
  distance: number;
}

const MARKDOWN_NOISE = /[*_`~#>]|\[([^\]]*)\]\([^)]*\)/g;
const PUNCTUATION = /[\p{P}\p{S}]+/gu;

/** Lowercase, strip accents/markdown/punctuation, collapse whitespace. */
export function normalizeAnswer(text: string): string {
  const normalized = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(MARKDOWN_NOISE, (_m, linkText) => linkText ?? ' ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an|to) /, '');
  // Answers made only of symbols (e.g. "+", "π") must still be comparable.
  return normalized || text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/** Levenshtein distance, with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    let rowMin = prev[0];
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
      rowMin = Math.min(rowMin, prev[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return prev[b.length];
}

/** How many typos we forgive for an answer of this (normalized) length. */
export function typoAllowance(length: number): number {
  if (length < 4) return 0;
  if (length < 8) return 1;
  return Math.min(3, Math.floor(length * 0.15));
}

/** All normalized forms an answer may take (with and without parentheticals). */
export function answerVariants(answer: string): string[] {
  const variants = new Set<string>();
  const full = normalizeAnswer(answer);
  if (full) variants.add(full);
  const withoutParens = normalizeAnswer(answer.replace(/\([^)]*\)/g, ' '));
  if (withoutParens) variants.add(withoutParens);
  return [...variants];
}

export function gradeWritten(response: string, answers: readonly string[]): GradeResult {
  const given = normalizeAnswer(response);
  const candidates = answers.filter((a) => a.trim().length > 0);
  let best: GradeResult = {
    verdict: 'incorrect',
    correct: false,
    expected: candidates[0] ?? '',
    distance: Number.POSITIVE_INFINITY,
  };
  if (!given) return best;

  for (const answer of candidates) {
    for (const variant of answerVariants(answer)) {
      // Numbers, dates and formulas must match exactly; typos are only forgiven in words.
      const allowance = /\d/.test(variant) ? 0 : typoAllowance(variant.length);
      const distance = editDistance(given, variant, Math.max(allowance, 3));
      if (distance < best.distance) {
        const verdict: Verdict =
          distance === 0 ? 'correct' : distance <= allowance ? 'almost' : 'incorrect';
        best = { verdict, correct: verdict !== 'incorrect', expected: answer, distance };
      }
      if (distance === 0) return best;
    }
  }
  return best;
}

/** Answers accepted for a card: its back plus any explicitly listed alternatives. */
export function acceptedAnswersFor(card: {
  back: string;
  acceptedAnswers?: readonly string[];
}): string[] {
  return [card.back, ...(card.acceptedAnswers ?? [])];
}

/** Two answers are "the same" for distractor de-duplication purposes. */
export function sameAnswer(a: string, b: string): boolean {
  const na = normalizeAnswer(a);
  return na.length > 0 && na === normalizeAnswer(b);
}
