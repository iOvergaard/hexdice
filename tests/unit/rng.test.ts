import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/engine/rng';

describe('Rng', () => {
  it('is deterministic per seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(new Rng(43).next()).not.toEqual(seqA[0]);
  });

  it('resumes from its state', () => {
    const a = new Rng(7);
    a.next();
    a.next();
    const resumed = new Rng(a.state);
    expect(resumed.next()).toEqual(a.next());
  });

  it('stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 10_000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
    }
  });

  it('rolls fair dice', () => {
    const r = new Rng(123);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) counts[r.die() - 1]!++;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });

  it('shuffles into a permutation', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const shuffled = new Rng(9).shuffle([...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });
});
