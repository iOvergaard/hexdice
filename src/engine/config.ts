import type { GameConfig, RulesConfig, SeatConfig } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const DEFAULT_RULES: Readonly<RulesConfig> = {
  gridWidth: 32,
  gridHeight: 24,
  territoryCount: 30,
  minTerritoryCells: 6,
  maxTerritoryCells: 40,
  landRatioMin: 0.65,
  landRatioMax: 0.75,
  maxDice: 8,
  maxReserve: 64,
  lossRule: 'classic',
  startingDiceFactor: 3,
};

export function makeConfig(seats: SeatConfig[], seed: number, overrides: Partial<RulesConfig> = {}): GameConfig {
  return { ...DEFAULT_RULES, ...overrides, seed: seed >>> 0, seats };
}

/** Fresh uint32 seed. Only for UI code starting a new board; never inside engine, AI or sim. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
