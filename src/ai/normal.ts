import type { Rng } from '../engine/rng';
import { attackOdds, diceAfterFailedAttack, largestGroup, legalAttacks } from '../engine/rules';
import type { Action, GameState, PlayerId, Territory } from '../engine/types';

const MIN_WIN = 0.5;
/** A runaway holds at least this many times the average territories of the players still in, and at least RUNAWAY_MIN. */
const RUNAWAY_RATIO = 1.5;
const RUNAWAY_MIN = 8;
/** Added to any attack on a runaway, so the table gangs up on whoever pulls away (19-11-2026). */
const RUNAWAY_BONUS = 0.6;
/** Per territory an attack cuts from the leader's largest group. */
const LEADER_BREAK = 0.15;

function withOwner(state: GameState, id: number, owner: PlayerId): GameState {
  const territories = state.territories.slice();
  territories[id] = { ...territories[id]!, owner } as Territory;
  return { ...state, territories };
}

/** The alive opponent with the biggest connected group, or null. */
function leader(state: GameState): PlayerId | null {
  let best: PlayerId | null = null;
  let bestSize = 0;
  for (const p of state.players) {
    if (!p.alive || p.id === state.current) continue;
    const size = largestGroup(state, p.id);
    if (size > bestSize) {
      best = p.id;
      bestSize = size;
    }
  }
  return best;
}

/** Alive opponents holding well above the average territory count. */
function runaways(state: GameState): Set<PlayerId> {
  const alive = state.players.filter((p) => p.alive && p.id !== state.current);
  const average = state.territories.length / (alive.length + 1);
  const held = (id: PlayerId) => state.territories.filter((t) => t.owner === id).length;
  return new Set(alive.map((p) => p.id).filter((id) => held(id) >= Math.max(RUNAWAY_MIN, RUNAWAY_RATIO * average)));
}

/** Odds-driven: take good fights that grow its group, break the leader's or hit a runaway; never stalls on a full board. */
export function chooseNormal(state: GameState, _rng: Rng): Action {
  const me = state.current;
  const max = state.config.maxDice;
  const attacks = legalAttacks(state);
  if (attacks.length === 0) return { type: 'endTurn' };

  const myGroup = largestGroup(state, me);
  const top = leader(state);
  const topGroup = top === null ? 0 : largestGroup(state, top);
  const run = runaways(state);

  let best: { from: number; to: number; score: number } | null = null;
  for (const a of attacks) {
    const src = state.territories[a.from]!;
    const dst = state.territories[a.to]!;
    const p = attackOdds(state, a.from, a.to);
    if (p < MIN_WIN && !(src.dice === max && p >= 0.3)) continue;

    const after = withOwner(state, a.to, me);
    let bonus = 0.08 * (largestGroup(after, me) - myGroup);
    if (dst.owner === top) bonus += LEADER_BREAK * (topGroup - largestGroup(after, top));
    if (run.has(dst.owner)) bonus += RUNAWAY_BONUS;
    if (state.territories.filter((t) => t.owner === dst.owner).length === 1) bonus += 0.3;
    // Cost of losing scales with the dice the loss rule takes off the stack.
    const lost = src.dice - diceAfterFailedAttack(state.config, src.dice, dst.dice, false);
    const risk = (1 - p) * ((lost + 1) / max);
    const score = p + bonus - risk;
    if (best === null || score > best.score) best = { from: a.from, to: a.to, score };
  }
  if (best) return { type: 'attack', from: best.from, to: best.to };

  // Waiting only helps if some border stack can still grow; otherwise fight on the best odds.
  const stalled = state.territories
    .filter((t) => t.owner === me && t.neighbours.some((n) => state.territories[n]!.owner !== me))
    .every((t) => t.dice >= max);
  if (!stalled) return { type: 'endTurn' };
  let fallback = attacks[0]!;
  let fallbackP = -1;
  for (const a of attacks) {
    const p = attackOdds(state, a.from, a.to);
    if (p > fallbackP) {
      fallback = a;
      fallbackP = p;
    }
  }
  return { type: 'attack', from: fallback.from, to: fallback.to };
}
