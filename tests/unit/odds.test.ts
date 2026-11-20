import { describe, expect, it } from 'vitest';
import { sumDistribution, winProbability } from '../../src/engine/odds';

function bruteForce(a: number, d: number, tiesToAttacker = false): number {
  const rolls = (n: number): number[] => {
    let sums = [0];
    for (let i = 0; i < n; i++) sums = sums.flatMap((s) => [1, 2, 3, 4, 5, 6].map((f) => s + f));
    return sums;
  };
  const as = rolls(a);
  const ds = rolls(d);
  let wins = 0;
  for (const x of as) for (const y of ds) if (x > y || (tiesToAttacker && x === y)) wins++;
  return wins / (as.length * ds.length);
}

describe('odds', () => {
  it('1 vs 1 is 15/36', () => {
    expect(winProbability(1, 1)).toBeCloseTo(15 / 36, 12);
  });

  it('matches brute force up to 3 vs 3', () => {
    for (let a = 1; a <= 3; a++) for (let d = 1; d <= 3; d++) expect(winProbability(a, d)).toBeCloseTo(bruteForce(a, d), 12);
  });

  it('ties favour the defender', () => {
    for (let n = 1; n <= 8; n++) expect(winProbability(n, n)).toBeLessThan(0.5);
  });

  it('against a shaken defender, ties go to the attacker', () => {
    for (let a = 1; a <= 3; a++) for (let d = 1; d <= 3; d++) expect(winProbability(a, d, true)).toBeCloseTo(bruteForce(a, d, true), 12);
    for (let a = 1; a <= 8; a++) for (let d = 1; d <= 8; d++) expect(winProbability(a, d, true)).toBeCloseTo(1 - winProbability(d, a), 12);
    for (let n = 1; n <= 8; n++) expect(winProbability(n, n, true)).toBeGreaterThan(0.5);
    expect(() => winProbability(1, 9, true)).toThrow(RangeError);
  });

  it('more attack dice never lower the odds', () => {
    for (let d = 1; d <= 8; d++) {
      for (let a = 1; a < 8; a++) expect(winProbability(a + 1, d)).toBeGreaterThanOrEqual(winProbability(a, d));
    }
  });

  it('sumDistribution(2) sums to 36', () => {
    const dist = sumDistribution(2);
    expect(dist).toHaveLength(13);
    expect(dist.reduce((a, b) => a + b, 0)).toBe(36);
  });

  it('rejects out-of-range dice counts', () => {
    expect(() => winProbability(0, 1)).toThrow(RangeError);
    expect(() => winProbability(1, 9)).toThrow(RangeError);
  });
});
