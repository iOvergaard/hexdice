import { winProbability } from '../engine/odds';
import type { Rng } from '../engine/rng';
import { largestGroup, legalAttacks } from '../engine/rules';
import type { Action, GameState, PlayerId, Territory } from '../engine/types';

const MIN_WIN = 0.5;

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

/** Odds-driven: take good fights that grow its group or break the leader's; never stalls on a full board. */
export function chooseNormal(state: GameState, _rng: Rng): Action {
  const me = state.current;
  const max = state.config.maxDice;
  const attacks = legalAttacks(state);
  if (attacks.length === 0) return { type: 'endTurn' };

  const myGroup = largestGroup(state, me);
  const top = leader(state);
  const topGroup = top === null ? 0 : largestGroup(state, top);

  let best: { from: number; to: number; score: number } | null = null;
  for (const a of attacks) {
    const src = state.territories[a.from]!;
    const dst = state.territories[a.to]!;
    const p = winProbability(src.dice, dst.dice);
    if (p < MIN_WIN && !(src.dice === max && p >= 0.3)) continue;

    const after = withOwner(state, a.to, me);
    let bonus = 0.08 * (largestGroup(after, me) - myGroup);
    if (dst.owner === top) bonus += 0.06 * (topGroup - largestGroup(after, top));
    if (state.territories.filter((t) => t.owner === dst.owner).length === 1) bonus += 0.3;
    // A lost fight drops the source to one die, so the cost scales with the stack.
    const risk = (1 - p) * (src.dice / max);
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
    const p = winProbability(state.territories[a.from]!.dice, state.territories[a.to]!.dice);
    if (p > fallbackP) {
      fallback = a;
      fallbackP = p;
    }
  }
  return { type: 'attack', from: fallback.from, to: fallback.to };
}
