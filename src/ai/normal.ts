import type { Rng } from '../engine/rng';
import type { Action, GameState } from '../engine/types';
import { chooseEasy } from './easy';
import { chooseHard } from './hard';

/** Share of Normal's moves that are Easy's: an odd attack against the odds, or a turn ended early (23-11-2026). */
export const NORMAL_SLIP = 0.25;

/** Plays like Hard, but a quarter of its moves are Easy's, so it slips up now and then. */
export function chooseNormal(state: GameState, rng: Rng): Action {
  return rng.next() < NORMAL_SLIP ? chooseEasy(state, rng) : chooseHard(state, rng);
}
