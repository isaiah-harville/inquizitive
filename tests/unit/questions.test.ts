import { describe, expect, it } from 'vitest';
import type { StudyCard } from '@/domain/models';
import { createRng, shuffle } from '@/domain/random';
import {
  buildCardQuestion,
  buildMultipleChoice,
  buildTrueFalse,
  isChoiceCorrect,
  pickDistractors,
  resolveAnswerSide,
} from '@/domain/study/questions';

const cards: StudyCard[] = [
  { id: '1', front: 'France', back: 'Paris' },
  { id: '2', front: 'Germany', back: 'Berlin' },
  { id: '3', front: 'Italy', back: 'Rome' },
  { id: '4', front: 'Spain', back: 'Madrid' },
  { id: '5', front: 'Vatican', back: 'Rome' }, // duplicate answer
  { id: '6', front: 'Peru', back: 'Lima', acceptedAnswers: ['Ciudad de los Reyes'] },
  { id: '7', front: 'Empty', back: '' },
];

describe('random', () => {
  it('is deterministic for a seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], createRng(42))).toEqual(
      shuffle([1, 2, 3, 4, 5], createRng(42)),
    );
    expect(shuffle([1, 2, 3, 4, 5], createRng(1))).not.toEqual(
      shuffle([1, 2, 3, 4, 5], createRng(2)),
    );
  });
});

describe('pickDistractors', () => {
  it('never includes the correct answer, duplicates, or empty strings', () => {
    for (let seed = 0; seed < 50; seed++) {
      const d = pickDistractors(cards[2], 'back', cards, 5, createRng(seed));
      expect(d).not.toContain('Rome');
      expect(d).not.toContain('');
      expect(new Set(d).size).toBe(d.length);
    }
  });

  it('excludes alternate accepted answers', () => {
    const pool: StudyCard[] = [
      { id: 'a', front: 'x', back: 'car', acceptedAnswers: ['automobile'] },
      { id: 'b', front: 'y', back: 'Automobile' },
      { id: 'c', front: 'z', back: 'boat' },
    ];
    expect(pickDistractors(pool[0], 'back', pool, 3, createRng(1))).toEqual(['boat']);
  });

  it('is deterministic', () => {
    const a = pickDistractors(cards[0], 'back', cards, 3, createRng(7));
    const b = pickDistractors(cards[0], 'back', cards, 3, createRng(7));
    expect(a).toEqual(b);
  });
});

describe('multiple choice', () => {
  it('has exactly one correct choice and unique options', () => {
    const q = buildMultipleChoice(cards[0], cards, { side: 'back', rng: createRng(3) });
    expect(q).not.toBeNull();
    if (!q) return;
    expect(q.prompt).toBe('France');
    expect(q.choices.filter((c) => c.text === 'Paris')).toHaveLength(1);
    expect(new Set(q.choices.map((c) => c.text)).size).toBe(q.choices.length);
    expect(q.choices.length).toBeLessThanOrEqual(4);
    expect(isChoiceCorrect(q, q.correctChoiceId)).toBe(true);
    expect(isChoiceCorrect(q, q.choices.find((c) => c.id !== q.correctChoiceId)?.id ?? '')).toBe(
      false,
    );
  });

  it('falls back to a written question when no distractors exist', () => {
    const solo: StudyCard[] = [{ id: 's', front: 'Q', back: 'A' }];
    const q = buildCardQuestion('multiple_choice', solo[0], solo, {
      side: 'back',
      rng: createRng(1),
    });
    expect(q.type).toBe('written');
  });

  it('can ask for the front', () => {
    const q = buildMultipleChoice(cards[1], cards, { side: 'front', rng: createRng(1) });
    expect(q?.prompt).toBe('Berlin');
    expect(q?.answer).toBe('Germany');
  });
});

describe('true/false', () => {
  it('produces both true and false statements across seeds, graded correctly', () => {
    const outcomes = new Set<boolean>();
    for (let seed = 0; seed < 40; seed++) {
      const q = buildTrueFalse(cards[0], cards, { side: 'back', rng: createRng(seed) });
      outcomes.add(q.isTrue);
      expect(q.isTrue).toBe(q.shown === 'Paris');
      expect(isChoiceCorrect(q, q.isTrue ? 'true' : 'false')).toBe(true);
    }
    expect(outcomes).toEqual(new Set([true, false]));
  });
});

describe('written', () => {
  it('includes accepted alternatives only when asking for the back', () => {
    const back = buildCardQuestion('written', cards[5], cards, { side: 'back', rng: createRng(1) });
    const front = buildCardQuestion('written', cards[5], cards, {
      side: 'front',
      rng: createRng(1),
    });
    expect(back.type === 'written' && back.acceptedAnswers).toEqual([
      'Lima',
      'Ciudad de los Reyes',
    ]);
    expect(front.type === 'written' && front.acceptedAnswers).toEqual(['Peru']);
  });
});

describe('resolveAnswerSide', () => {
  it("is stable per card for 'both'", () => {
    const sides = cards.map((c) => resolveAnswerSide('both', c.id, 9));
    expect(cards.map((c) => resolveAnswerSide('both', c.id, 9))).toEqual(sides);
    expect(resolveAnswerSide('front', 'x', 1)).toBe('front');
  });
});
