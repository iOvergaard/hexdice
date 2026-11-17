import { applyAction } from '../engine/rules';
import { createGame } from '../engine/setup';
import type { Action, GameConfig, GameState } from '../engine/types';

const VERSION = 1;

export interface RestoredGame {
  config: GameConfig;
  actions: Action[];
  state: GameState;
}

/** The engine is deterministic, so config + action log is the whole game. */
export function serialise(config: GameConfig, actions: readonly Action[]): string {
  return JSON.stringify({ v: VERSION, config, actions });
}

function isAction(a: unknown): a is Action {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  return x.type === 'endTurn' || (x.type === 'attack' && Number.isInteger(x.from) && Number.isInteger(x.to));
}

/** Never throws: anything missing, corrupt, outdated, illegal or already finished gives null. */
export function restore(raw: string | null): RestoredGame | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { v?: unknown; config?: unknown; actions?: unknown } | null;
    if (!data || data.v !== VERSION || typeof data.config !== 'object' || data.config === null || !Array.isArray(data.actions)) return null;
    const config = data.config as GameConfig;
    if (!Number.isInteger(config.seed) || !Array.isArray(config.seats) || !data.actions.every(isAction)) return null;
    const actions = data.actions as Action[];
    let state = createGame(config);
    for (const action of actions) state = applyAction(state, action).state;
    return state.winner === null ? { config, actions, state } : null;
  } catch {
    return null;
  }
}
