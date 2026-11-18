import { applyAction } from '../engine/rules';
import { createGame } from '../engine/setup';
import type { Action, GameConfig, GameState } from '../engine/types';

const VERSION = 1;

export interface RestoredGame {
  config: GameConfig;
  actions: Action[];
  state: GameState;
  /** The AI's random state when the game was saved, so the AIs carry on as if never interrupted; null in older saves. */
  aiRngState: number | null;
}

/** The engine is deterministic, so config + action log is the whole game; the AI's random state keeps the AIs on course. */
export function serialise(config: GameConfig, actions: readonly Action[], aiRngState?: number): string {
  return JSON.stringify({ v: VERSION, config, actions, ai: aiRngState });
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
    const data = JSON.parse(raw) as { v?: unknown; config?: unknown; actions?: unknown; ai?: unknown } | null;
    if (!data || data.v !== VERSION || typeof data.config !== 'object' || data.config === null || !Array.isArray(data.actions)) return null;
    // Saves from before the connection bonus were played without it.
    const config = { connectionBonus: 'off', ...data.config } as GameConfig;
    if (!Number.isInteger(config.seed) || !Array.isArray(config.seats) || !data.actions.every(isAction)) return null;
    const actions = data.actions as Action[];
    let state = createGame(config);
    for (const action of actions) state = applyAction(state, action).state;
    const aiRngState = Number.isInteger(data.ai) ? (data.ai as number) >>> 0 : null;
    return state.winner === null ? { config, actions, state, aiRngState } : null;
  } catch {
    return null;
  }
}
