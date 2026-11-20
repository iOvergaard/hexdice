/** Nearest-rank percentile of an ascending list; p in 0..1. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}

export interface LengthStats {
  games: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
  /** Share of games that ran past 60 rounds. */
  over60Share: number;
}

export function lengthStats(rounds: readonly number[]): LengthStats {
  const sorted = [...rounds].sort((a, b) => a - b);
  return {
    games: sorted.length,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
    over60Share: sorted.length === 0 ? 0 : sorted.filter((r) => r > 60).length / sorted.length,
  };
}

/**
 * Eight-player game-length limits, first set at p90 26, p99 33: about 50% above front-line reinforcement (p90 17, p99 22,
 * none past 60 over 1,000 games; 18-11-2026). Raised on 20-11-2026 (Jacob, issue #7), since the Normal AI ganging up on
 * runaways gives p90 22, p99 31 on the CI seeds and left two rounds of headroom. Random reinforcement (p90 35, p99 54)
 * and the rules that caused endless standoffs (attrition, half-stack, narrow land bridges) still break them.
 */
export const LENGTH_LIMITS = { maxP90: 28, maxP99: 36, maxOver60Share: 0.005 } as const;

/** Why a length distribution fails the limits; empty when it passes. */
export function lengthFailures(stats: LengthStats, limits: { maxP90: number; maxP99: number; maxOver60Share: number } = LENGTH_LIMITS): string[] {
  const failures: string[] = [];
  if (stats.p90 > limits.maxP90) failures.push(`p90 ${stats.p90} rounds > ${limits.maxP90}`);
  if (stats.p99 > limits.maxP99) failures.push(`p99 ${stats.p99} rounds > ${limits.maxP99}`);
  if (stats.over60Share > limits.maxOver60Share) {
    failures.push(`${(stats.over60Share * 100).toFixed(1)}% of games past 60 rounds > ${limits.maxOver60Share * 100}%`);
  }
  return failures;
}
