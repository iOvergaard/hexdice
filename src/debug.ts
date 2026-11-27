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
  sounds(): string[];
  /** The track the game is on (heard only with sound and music on). */
  music(): string | null;
  /** Where the live game left its action log; empty when every action is in it. */
  problems(): string[];
}

declare global {
  interface Window {
    __hexdice?: HexdiceDebug;
  }
}

/** Every build, the live site too, so a game there can be driven and checked from the console. */
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
    sounds: () => [...c.sound.log],
    music: () => c.music.wanted(),
    problems: () => [...c.getLogProblems()],
  };
}
