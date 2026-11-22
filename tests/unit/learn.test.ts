import { describe, expect, it } from 'vitest';
import type { StudyCard } from '@/domain/models';
import {
  answerLearn,
  currentCardId,
  currentQuestion,
  isRoundComplete,
  learnProgress,
  MASTERY_LEVEL,
  nextRound,
  questionTypeFor,
  startLearn,
} from '@/domain/study/learn';

const cards: StudyCard[] = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i}`,
  front: `term ${i}`,
  back: `definition number ${i}`,
}));
const ids = cards.map((c) => c.id);
const byId = new Map(cards.map((c) => [c.id, c]));
const settings = {
  questionTypes: ['multiple_choice', 'written'] as const,
  direction: 'back' as const,
  roundSize: 4,
};

function start(seed = 1) {
  return startLearn(ids, { ...settings, questionTypes: [...settings.questionTypes] }, seed);
}

describe('learn mode', () => {
  it('starts a first round of roundSize cards', () => {
    const s = start();
    expect(s.round).toBe(1);
    expect(s.queue).toHaveLength(4);
    expect(new Set(s.queue).size).toBe(4);
    expect(s.completed).toBe(false);
  });

  it('is deterministic for a seed', () => {
    expect(start(5)).toEqual(start(5));
    const a = start(5);
    expect(currentQuestion(a, byId, cards)).toEqual(currentQuestion(start(5), byId, cards));
  });

  it('uses easier questions for new cards and harder ones once familiar', () => {
    let s = start();
    const id = currentCardId(s) as string;
    expect(questionTypeFor(s, id)).toBe('multiple_choice');
    s = { ...s, cards: { ...s.cards, [id]: { level: 1, attempts: 1, misses: 0 } } };
    expect(questionTypeFor(s, id)).toBe('written');
  });

  it('re-asks a missed card later in the same round', () => {
    let s = start();
    const missed = currentCardId(s) as string;
    s = answerLearn(s, false);
    expect(s.queue.indexOf(missed)).toBe(2);
    expect(s.cards[missed]).toEqual({ level: 0, attempts: 1, misses: 1 });
    expect(s.roundResults[missed]).toBe(false);
  });

  it('does not let a level drop below zero and caps at mastery', () => {
    let s = start();
    const id = currentCardId(s) as string;
    s = answerLearn(s, false);
    expect(s.cards[id].level).toBe(0);
    s = {
      ...s,
      queue: [id],
      cards: { ...s.cards, [id]: { level: MASTERY_LEVEL, attempts: 3, misses: 1 } },
    };
    s = answerLearn(s, true);
    expect(s.cards[id].level).toBe(MASTERY_LEVEL);
  });

  it('prioritizes missed cards in the next round', () => {
    let s = start();
    const firstRound = [...s.queue];
    const missed = firstRound[0];
    // Miss the first card once, answer everything else (and the retry) correctly.
    s = answerLearn(s, false);
    while (!isRoundComplete(s)) s = answerLearn(s, true);
    s = nextRound(s);
    expect(s.round).toBe(2);
    expect(s.roundCardIds[0]).toBe(missed);
  });

  it('completes once every card is mastered and never asks mastered cards', () => {
    let s = start(3);
    let guard = 0;
    while (!s.completed && guard++ < 500) {
      if (isRoundComplete(s)) {
        s = nextRound(s);
        continue;
      }
      const id = currentCardId(s) as string;
      expect(s.cards[id].level).toBeLessThan(MASTERY_LEVEL);
      s = answerLearn(s, true);
    }
    expect(s.completed).toBe(true);
    expect(learnProgress(s)).toMatchObject({ mastered: 10, ratio: 1 });
    // All-correct: each card needs exactly MASTERY_LEVEL correct answers.
    expect(s.step).toBe(10 * MASTERY_LEVEL);
  });

  it('handles an empty set', () => {
    const s = startLearn([], { ...settings, questionTypes: ['written'] }, 1);
    expect(s.completed).toBe(true);
    expect(learnProgress(s).ratio).toBe(1);
  });

  it('rejects an empty question-type list', () => {
    expect(() => startLearn(ids, { ...settings, questionTypes: [] }, 1)).toThrow();
  });

  it('state survives a JSON round-trip (resumable)', () => {
    let s = start();
    s = answerLearn(s, true);
    s = answerLearn(s, false);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
