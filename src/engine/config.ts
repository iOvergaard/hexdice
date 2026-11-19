import type { GameConfig, RulesConfig, SeatConfig } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const DEFAULT_RULES: Readonly<RulesConfig> = {
  gridWidth: 44,
  gridHeight: 33,
  territoryCount: 30,
  minTerritoryCells: 6,
  maxTerritoryCells: 40,
  landRatioMin: 0.33,
  landRatioMax: 0.4,
  lakeCount: 3,
  lakeSizeMin: 4,
  lakeSizeMax: 9,
  riverCount: 2,
  riverLengthMin: 10,
  riverLengthMax: 17,
  fordsPerRiver: 1,
  maxDice: 8,
  maxReserve: 64,
  lossRule: 'drawAttrition',
  reinforcement: 'frontline',
  frontlineOverflow: 'behind',
  connectionBonus: 'catchup',
  eliminationBonus: 1,
  lastStandDice: 1,
  startingDiceFactor: 3,
  seatCompensation: true,
};

export function makeConfig(seats: SeatConfig[], seed: number, overrides: Partial<RulesConfig> = {}): GameConfig {
  return { ...DEFAULT_RULES, ...overrides, seed: seed >>> 0, seats };
}

/** Fresh uint32 seed. Only for UI code starting a new board; never inside engine, AI or sim. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
