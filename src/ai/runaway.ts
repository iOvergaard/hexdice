import type { GameState, PlayerId } from '../engine/types';

/** A runaway holds at least this many times the average territories of the players still in, and at least RUNAWAY_MIN. */
const RUNAWAY_RATIO = 1.5;
const RUNAWAY_MIN = 8;

/** Territories that make a runaway on a map of `territories` with `alive` players still in. */
export function runawayBar(territories: number, alive: number): number {
  return Math.max(RUNAWAY_MIN, Math.ceil((RUNAWAY_RATIO * territories) / alive));
}

/** Players still in holding at least the runaway bar. */
export function runaways(state: GameState): Set<PlayerId> {
  const alive = state.players.filter((p) => p.alive);
  const bar = runawayBar(state.territories.length, alive.length);
  const held = (id: PlayerId) => state.territories.filter((t) => t.owner === id).length;
  return new Set(alive.map((p) => p.id).filter((id) => held(id) >= bar));
}

/** Runaways a Normal or Hard computer player gangs up on: one other than them is still in, with a second opponent to pick from. */
export function gangedUpOn(state: GameState): Set<PlayerId> {
  const alive = state.players.filter((p) => p.alive);
  if (alive.length < 3) return new Set();
  const hunters = alive.filter((p) => p.kind === 'ai' && (p.aiLevel ?? 'hard') !== 'easy');
  return new Set([...runaways(state)].filter((id) => hunters.some((p) => p.id !== id)));
}
