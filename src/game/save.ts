import { applyAction } from '../engine/rules';
import { createGame } from '../engine/setup';
import type { Action, GameConfig, GameEvent, GameState } from '../engine/types';

/** 2 from 23-11-2026: the level called Normal before then is Hard now. */
const VERSION = 2;

export interface RestoredGame {
  config: GameConfig;
  actions: Action[];
  state: GameState;
  /** Everything the actions produced, so the end-of-game summary covers the whole game. */
  events: GameEvent[];
  /** The AI's random state when the game was saved, so the AIs carry on as if never interrupted; null in older saves. */
  aiRngState: number | null;
}

/** The engine is deterministic, so config + action log is the whole game; the AI's random state keeps the AIs on course. Problems: where the live game left its log, for bug reports. */
export function serialise(config: GameConfig, actions: readonly Action[], aiRngState?: number, problems: readonly string[] = []): string {
  return JSON.stringify({ v: VERSION, config, actions, ai: aiRngState, ...(problems.length ? { problems } : {}) });
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
    if (!data || (data.v !== VERSION && data.v !== 1) || typeof data.config !== 'object' || data.config === null || !Array.isArray(data.actions)) return null;
    // Saves from before the connection bonus, the last stand, overflow behind the front, the seat retune and the shaken rule were played without them.
    let config = { connectionBonus: 'off', lastStandDice: 0, frontlineOverflow: 'reserve', seatTables: 1, shaken: false, ...data.config } as GameConfig;
    if (!Number.isInteger(config.seed) || !Array.isArray(config.seats) || !data.actions.every(isAction)) return null;
    // A version 1 save played its Normal computer players as Hard does today: keep the same opponents.
    if (data.v === 1) config = { ...config, seats: config.seats.map((s) => (s.aiLevel === 'normal' ? { ...s, aiLevel: 'hard' } : s)) };
    const actions = data.actions as Action[];
    let state = createGame(config);
    const events: GameEvent[] = [];
    for (const action of actions) {
      const result = applyAction(state, action);
      state = result.state;
      events.push(...result.events);
    }
    const aiRngState = Number.isInteger(data.ai) ? (data.ai as number) >>> 0 : null;
    return state.winner === null ? { config, actions, state, events, aiRngState } : null;
  } catch {
    return null;
  }
}
