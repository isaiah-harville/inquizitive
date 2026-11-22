import { describe, expect, it } from 'vitest';
import type { StudyCard } from '@/domain/models';
import type { MatchingQuestion, WrittenQuestion } from '@/domain/study/questions';
import { buildTest, DEFAULT_TEST_CONFIG, gradeTest } from '@/domain/study/test';

const cards: StudyCard[] = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  front: `term ${i}`,
  back: `meaning ${i}`,
}));

describe('practice tests', () => {
  it('covers each chosen card exactly once', () => {
    const qs = buildTest(cards, { ...DEFAULT_TEST_CONFIG, questionCount: 10 }, 42);
    const covered = qs.flatMap((q) =>
      q.type === 'matching' ? q.items.map((i) => i.cardId) : [q.cardId],
    );
    expect(covered).toHaveLength(10);
    expect(new Set(covered).size).toBe(10);
  });

  it('is deterministic for a seed', () => {
    expect(buildTest(cards, DEFAULT_TEST_CONFIG, 7)).toEqual(
      buildTest(cards, DEFAULT_TEST_CONFIG, 7),
    );
  });

  it('respects the selected types', () => {
    const qs = buildTest(cards, { ...DEFAULT_TEST_CONFIG, types: ['true_false'] }, 1);
    expect(qs.every((q) => q.type === 'true_false')).toBe(true);
  });

  it('restricts to selected cards', () => {
    const qs = buildTest(
      cards,
      { ...DEFAULT_TEST_CONFIG, types: ['written'], cardIds: ['c1', 'c2'] },
      1,
    );
    expect(qs.map((q) => q.type !== 'matching' && q.cardId).sort()).toEqual(['c1', 'c2']);
  });

  it('keeps card order when not randomized', () => {
    const qs = buildTest(
      cards,
      { ...DEFAULT_TEST_CONFIG, types: ['written'], randomize: false, questionCount: 3 },
      1,
    );
    expect(qs.map((q) => q.type !== 'matching' && q.cardId)).toEqual(['c0', 'c1', 'c2']);
  });

  it('never builds a one-item matching question', () => {
    for (let n = 1; n <= 12; n++) {
      const qs = buildTest(
        cards,
        { ...DEFAULT_TEST_CONFIG, types: ['matching'], questionCount: n },
        n,
      );
      for (const q of qs)
        if (q.type === 'matching') expect(q.items.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('grades a mix of responses and reports missed cards', () => {
    const qs = buildTest(cards, { ...DEFAULT_TEST_CONFIG, questionCount: 12 }, 3);
    const responses: Record<string, string | Record<string, string>> = {};
    for (const q of qs) {
      if (q.type === 'matching') {
        // Get every pair right except swap the first two.
        const pairs = Object.fromEntries(q.items.map((i) => [i.cardId, i.cardId]));
        const [a, b] = q.items;
        pairs[a.cardId] = b.cardId;
        pairs[b.cardId] = a.cardId;
        responses[q.id] = pairs;
      } else if (q.type === 'written') {
        responses[q.id] = q.answer;
      } else if (q.type === 'multiple_choice') {
        responses[q.id] = q.correctChoiceId;
      } else if (q.type === 'true_false') {
        responses[q.id] = q.isTrue ? 'false' : 'true'; // deliberately wrong
      }
    }
    const summary = gradeTest(qs, responses);
    const tf = qs.filter((q) => q.type === 'true_false');
    const matching = qs.filter((q): q is MatchingQuestion => q.type === 'matching');
    const expectedMissed = tf.length + matching.length * 2;
    expect(summary.missedCardIds).toHaveLength(expectedMissed);
    expect(summary.maxScore).toBe(qs.length);
    expect(summary.percent).toBeGreaterThan(0);
    expect(summary.percent).toBeLessThan(100);
  });

  it('scores unanswered questions as wrong', () => {
    const qs = buildTest(
      cards,
      { ...DEFAULT_TEST_CONFIG, types: ['written'], questionCount: 3 },
      1,
    );
    const summary = gradeTest(qs, {});
    expect(summary.score).toBe(0);
    expect(summary.missedCardIds).toHaveLength(3);
  });

  it("accepts typo'd written answers as almost-correct", () => {
    const qs = buildTest(
      [{ id: 'x', front: 'organelle', back: 'mitochondria' }],
      { ...DEFAULT_TEST_CONFIG, types: ['written'], questionCount: 1 },
      1,
    );
    const q = qs[0] as WrittenQuestion;
    const summary = gradeTest(qs, { [q.id]: 'mitocondria' });
    expect(summary.results[0]).toMatchObject({ correct: true, almost: true });
  });
});
