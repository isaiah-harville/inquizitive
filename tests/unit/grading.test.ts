import { describe, expect, it } from 'vitest';
import { editDistance, gradeWritten, normalizeAnswer, typoAllowance } from '@/domain/grading/grade';

describe('normalizeAnswer', () => {
  it('lowercases, strips accents, punctuation and markdown', () => {
    expect(normalizeAnswer('  **Café**, au-lait!  ')).toBe('cafe au lait');
    expect(normalizeAnswer('The Mitochondria')).toBe('mitochondria');
    expect(normalizeAnswer('[link text](http://x.y)')).toBe('link text');
    expect(normalizeAnswer('salt & pepper')).toBe('salt and pepper');
  });

  it('keeps symbol-only answers comparable', () => {
    expect(normalizeAnswer('+')).toBe('+');
    expect(normalizeAnswer(' ≠ ')).toBe('≠');
  });
});

describe('editDistance', () => {
  it('computes Levenshtein distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
  });

  it('exits early past the max', () => {
    expect(editDistance('aaaaaaaa', 'bbbbbbbb', 2)).toBeGreaterThan(2);
  });
});

describe('gradeWritten', () => {
  it('accepts exact answers regardless of case and punctuation', () => {
    expect(gradeWritten('photosynthesis.', ['Photosynthesis']).verdict).toBe('correct');
  });

  it('accepts alternative answers', () => {
    const r = gradeWritten('H2O', ['water', 'H2O']);
    expect(r.verdict).toBe('correct');
    expect(r.expected).toBe('H2O');
  });

  it('treats parenthetical text as optional', () => {
    expect(gradeWritten('Paris', ['Paris (France)']).verdict).toBe('correct');
    expect(gradeWritten('paris france', ['Paris (France)']).verdict).toBe('correct');
  });

  it("forgives small typos on longer words as 'almost'", () => {
    const r = gradeWritten('mitocondria', ['mitochondria']);
    expect(r.verdict).toBe('almost');
    expect(r.correct).toBe(true);
  });

  it('does not forgive typos in short answers', () => {
    expect(gradeWritten('cot', ['cat']).verdict).toBe('incorrect');
  });

  it('requires numbers to match exactly', () => {
    expect(gradeWritten('1946', ['1945']).verdict).toBe('incorrect');
    expect(gradeWritten('1945', ['1945']).verdict).toBe('correct');
  });

  it('rejects empty and unrelated answers', () => {
    expect(gradeWritten('', ['anything']).correct).toBe(false);
    expect(gradeWritten('   ', ['anything']).correct).toBe(false);
    expect(gradeWritten('banana', ['mitochondria']).correct).toBe(false);
  });

  it('scales typo allowance with length', () => {
    expect(typoAllowance(3)).toBe(0);
    expect(typoAllowance(5)).toBe(1);
    expect(typoAllowance(20)).toBe(3);
  });
});
