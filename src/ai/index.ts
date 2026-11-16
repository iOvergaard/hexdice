import type { Rng } from '../engine/rng';
import type { Action, AiLevel, GameState } from '../engine/types';

/** Next action for state.current. Stub until Task D lands: always ends the turn. */
export function chooseAction(_state: GameState, _level: AiLevel, _rng: Rng): Action {
  return { type: 'endTurn' };
}
