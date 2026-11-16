import type { Controller } from './game/controller';
import type { Action, GameEvent, GameState, TerritoryId } from './engine/types';

export interface HexdiceDebug {
  state(): GameState | null;
  actions(): Action[];
  events(): GameEvent[];
  attack(from: TerritoryId, to: TerritoryId): Promise<void>;
  endTurn(): Promise<void>;
  autoplay(on: boolean): void;
  load(state: GameState): void;
  idle(): Promise<void>;
}

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/** Dev builds only; the caller checks import.meta.env.DEV. */
export function installDebug(c: Controller): void {
  window.__hexdice = {
    state: () => c.getState(),
    actions: () => [...c.getActions()],
    events: () => [...c.getEvents()],
    attack: (from, to) => c.attack(from, to),
    endTurn: () => c.endTurn(),
    autoplay: (on) => c.setAutoplay(on),
    load: (state) => c.load(state),
    idle: () => c.idle(),
  };
}
