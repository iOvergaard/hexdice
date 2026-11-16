import { winProbability } from '../engine/odds';
import type { Rng } from '../engine/rng';
import { legalAttacks } from '../engine/rules';
import type { Action, GameState } from '../engine/types';

const ATTACK_CHANCE = 0.9;

/** Random legal attacks, skipping the ones that cannot win. */
export function chooseEasy(state: GameState, rng: Rng): Action {
  const options = legalAttacks(state).filter((a) => {
    return winProbability(state.territories[a.from]!.dice, state.territories[a.to]!.dice) > 0;
  });
  if (options.length === 0 || rng.next() >= ATTACK_CHANCE) return { type: 'endTurn' };
  const pick = rng.pick(options);
  return { type: 'attack', from: pick.from, to: pick.to };
}
