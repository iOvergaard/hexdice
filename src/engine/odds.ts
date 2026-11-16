const MAX_TABLE_DICE = 8;

/** index = sum, value = number of ways to roll it with `dice` d6 (length 6 * dice + 1). */
export function sumDistribution(dice: number): number[] {
  let dist = [1];
  for (let d = 0; d < dice; d++) {
    const next = new Array<number>(dist.length + 6).fill(0);
    for (let s = 0; s < dist.length; s++) {
      for (let face = 1; face <= 6; face++) next[s + face]! += dist[s]!;
    }
    dist = next;
  }
  return dist;
}

function computeWinProbability(a: number, d: number): number {
  const da = sumDistribution(a);
  const dd = sumDistribution(d);
  let wins = 0;
  for (let sa = 0; sa < da.length; sa++) {
    for (let sd = 0; sd < sa && sd < dd.length; sd++) wins += da[sa]! * dd[sd]!;
  }
  return wins / 6 ** (a + d);
}

const TABLE: number[][] = Array.from({ length: MAX_TABLE_DICE + 1 }, (_, a) =>
  Array.from({ length: MAX_TABLE_DICE + 1 }, (_, d) => (a === 0 || d === 0 ? 0 : computeWinProbability(a, d))),
);

/** P(attacker sum > defender sum); ties go to the defender. Both counts 1..8. */
export function winProbability(attackDice: number, defendDice: number): number {
  const p = TABLE[attackDice]?.[defendDice];
  if (!Number.isInteger(attackDice) || !Number.isInteger(defendDice) || attackDice < 1 || defendDice < 1 || p === undefined) {
    throw new RangeError(`dice counts must be integers 1–${MAX_TABLE_DICE}`);
  }
  return p;
}
