export type OddsBand = 'good' | 'risky' | 'poor';

/** Formats a win probability for a badge. Never rounds a non-certain result to 100% or a possible one to 0%. */
export function formatOdds(p: number): { text: string; band: OddsBand } {
  let pct = Math.round(p * 100);
  if (p < 1) pct = Math.min(pct, 99);
  if (p > 0) pct = Math.max(pct, 1);
  const band: OddsBand = p >= 0.6 ? 'good' : p >= 0.4 ? 'risky' : 'poor';
  return { text: `${pct}%`, band };
}
