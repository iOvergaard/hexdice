import type { Rng } from '../engine/rng';
import { attackOdds, legalAttacks } from '../engine/rules';
import type { Action, GameState } from '../engine/types';

const ATTACK_CHANCE = 0.9;

/** Random legal attacks, skipping the ones that cannot win. */
export function chooseEasy(state: GameState, rng: Rng): Action {
  const options = legalAttacks(state).filter((a) => attackOdds(state, a.from, a.to) > 0);
  if (options.length === 0 || rng.next() >= ATTACK_CHANCE) return { type: 'endTurn' };
  const pick = rng.pick(options);
  return { type: 'attack', from: pick.from, to: pick.to };
}
