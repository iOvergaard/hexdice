import { describe, expect, it } from 'vitest';
import { LENGTH_LIMITS, lengthFailures, lengthStats, percentile } from '../../scripts/stats';

describe('game-length stats', () => {
  it('takes nearest-rank percentiles', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile(sorted, 0.9)).toBe(90);
    expect(percentile(sorted, 0.99)).toBe(99);
    expect(percentile([7], 0.99)).toBe(7);
  });

  it('summarises rounds without caring about order', () => {
    const stats = lengthStats([30, 10, 20, 70, 40]);
    expect(stats).toEqual({ games: 5, p50: 30, p90: 70, p99: 70, max: 70, over60Share: 0.2 });
  });

  it('passes a healthy distribution', () => {
    const rounds = Array.from({ length: 1000 }, (_, i) => 15 + (i % 30));
    expect(lengthFailures(lengthStats(rounds))).toEqual([]);
  });

  it('fails a long tail of endless standoffs', () => {
    // Like the attrition rule on continent maps: most games are fine, a few never end.
    const rounds = Array.from({ length: 1000 }, (_, i) => (i < 30 ? 1001 : 15 + (i % 30)));
    const failures = lengthFailures(lengthStats(rounds));
    expect(failures.join(' ')).toContain('p99');
    expect(failures.join(' ')).toContain('past 60');
  });

  it('fails a slow middle even without a tail', () => {
    const rounds = Array.from({ length: 1000 }, () => LENGTH_LIMITS.maxP90 + 5);
    expect(lengthFailures(lengthStats(rounds)).join(' ')).toContain('p90');
  });
});
