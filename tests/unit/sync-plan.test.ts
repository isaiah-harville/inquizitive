import { describe, expect, it } from 'vitest';
import { emptyManifest, type Manifest, planSync } from '@/domain/sync';

const m = (over: Partial<Manifest>): Manifest => ({ ...emptyManifest(), ...over });

describe('planSync', () => {
  it('pushes rows only on this side and pulls rows only on the other', () => {
    const plan = planSync(m({ sets: { a: 1 } }), m({ sets: { b: 1 } }));
    expect(plan.push.sets).toEqual(['a']);
    expect(plan.pull.sets).toEqual(['b']);
  });

  it('keeps the newer side of a row both have and ignores equal timestamps', () => {
    const plan = planSync(m({ cards: { x: 5, y: 1, z: 3 } }), m({ cards: { x: 2, y: 4, z: 3 } }));
    expect(plan.push.cards).toEqual(['x']);
    expect(plan.pull.cards).toEqual(['y']);
  });

  it('applies a remote deletion that happened after the last local edit', () => {
    const plan = planSync(
      m({ sets: { a: 10 } }),
      m({ tombstones: [{ entity: 'set', id: 'a', deletedAt: 20 }] }),
    );
    expect(plan.applyTombstones).toEqual([{ entity: 'set', id: 'a', deletedAt: 20 }]);
    expect(plan.push.sets).toEqual([]);
  });

  it('pushes a row edited after the other side deleted it', () => {
    const plan = planSync(
      m({ sets: { a: 30 } }),
      m({ tombstones: [{ entity: 'set', id: 'a', deletedAt: 20 }] }),
    );
    expect(plan.push.sets).toEqual(['a']);
    expect(plan.applyTombstones).toEqual([]);
  });

  it('sends a local deletion instead of pulling the row back', () => {
    const plan = planSync(
      m({ tombstones: [{ entity: 'card', id: 'c', deletedAt: 9 }] }),
      m({ cards: { c: 5 } }),
    );
    expect(plan.pushTombstones).toEqual([{ entity: 'card', id: 'c', deletedAt: 9 }]);
    expect(plan.pull.cards).toEqual([]);
  });

  it('exchanges review history by id', () => {
    const plan = planSync(m({ reviews: ['r1', 'r2'] }), m({ reviews: ['r2', 'r3'] }));
    expect(plan.push.reviews).toEqual(['r1']);
    expect(plan.pull.reviews).toEqual(['r3']);
  });

  it('pushes progress that only this side has and pulls newer progress', () => {
    const plan = planSync(m({ progress: { a: 2, b: 1 } }), m({ progress: { b: 3, c: 1 } }));
    expect(plan.push.progress).toEqual(['a']);
    expect(plan.pull.progress.sort()).toEqual(['b', 'c']);
  });
});
