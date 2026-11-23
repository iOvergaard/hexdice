import type { Rng } from '../engine/rng';
import type { Action, AiLevel, GameState } from '../engine/types';
import { chooseEasy } from './easy';
import { chooseHard } from './hard';
import { chooseNormal } from './normal';

/** Next action for state.current. Pure apart from drawing from rng. */
export function chooseAction(state: GameState, level: AiLevel, rng: Rng): Action {
  if (level === 'easy') return chooseEasy(state, rng);
  return level === 'normal' ? chooseNormal(state, rng) : chooseHard(state, rng);
}
