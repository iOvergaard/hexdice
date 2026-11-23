import type { GameState } from '../engine/types';

/** How two states differ in anything a replay would show; empty when they match. Used to check the live game against its action log. */
export function boardDiff(a: GameState, b: GameState): string[] {
  const diff: string[] = [];
  const field = (name: string, x: unknown, y: unknown): void => {
    if (JSON.stringify(x) !== JSON.stringify(y)) diff.push(`${name} ${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
  };
  field('current', a.current, b.current);
  field('round', a.round, b.round);
  field('rngState', a.rngState, b.rngState);
  field('winner', a.winner, b.winner);
  field('finalStarted', a.finalStarted, b.finalStarted);
  field('spent', a.spent, b.spent);
  field('shaken', a.shaken, b.shaken);
  a.territories.forEach((t, i) => {
    const u = b.territories[i];
    if (!u || t.owner !== u.owner || t.dice !== u.dice) diff.push(`territory ${t.id} ${t.owner}/${t.dice} vs ${u ? `${u.owner}/${u.dice}` : 'none'}`);
  });
  a.players.forEach((p, i) => {
    const q = b.players[i];
    if (!q || p.alive !== q.alive || p.reserve !== q.reserve || p.knockouts !== q.knockouts) diff.push(`player ${p.id} ${JSON.stringify(p)} vs ${JSON.stringify(q)}`);
  });
  return diff;
}
