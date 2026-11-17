// Shared contract between engine, AI, UI and controller. Changes go through the PM.

export type PlayerId = number;
export type TerritoryId = number;
/** Cell index on the hex grid: row * width + col. */
export type CellIndex = number;
export type AiLevel = 'easy' | 'normal';
export type SeatKind = 'human' | 'ai';
export type Speed = 'slow' | 'normal' | 'fast' | 'instant';
/**
 * What a failed attack (a loss, or a draw since ties go to the defender) costs the attacking stack.
 * 'classic': it drops to 1. 'attrition': it drops to the defender's dice, losing at least 1, never below 1.
 * 'drawAttrition': attrition on a draw, classic on a clear loss. 'halfStack': it loses half, rounded up, never below 1.
 */
export type LossRule = 'classic' | 'attrition' | 'drawAttrition' | 'halfStack';

export interface RulesConfig {
  gridWidth: number;
  gridHeight: number;
  territoryCount: number;
  minTerritoryCells: number;
  maxTerritoryCells: number;
  landRatioMin: number;
  landRatioMax: number;
  /** Inland lakes carved out of the landmass, each lakeSizeMin..lakeSizeMax cells; they may merge. */
  lakeCount: number;
  lakeSizeMin: number;
  lakeSizeMax: number;
  maxDice: number;
  maxReserve: number;
  lossRule: LossRule;
  /** Extra dice per reinforcement, permanently, for each opponent the player has knocked out. */
  eliminationBonus: number;
  /** Starting dice per player: floor(startingDiceFactor * territoryCount / players). */
  startingDiceFactor: number;
}

export interface SeatConfig {
  name: string;
  kind: SeatKind;
  /** Required when kind is 'ai'. */
  aiLevel?: AiLevel;
  /** 0–7. Index into the UI's colour and emblem tables. */
  identity: number;
}

export interface GameConfig extends RulesConfig {
  /** uint32 */
  seed: number;
  /** 2–8 seats, in setup order. createGame shuffles them into turn order. */
  seats: SeatConfig[];
}

export interface Board {
  width: number;
  height: number;
  /** cellTerritory[cell] = owning territory id, or -1 for sea. Length width * height. */
  cellTerritory: TerritoryId[];
}

export interface Territory {
  /** Equals the territory's index in GameState.territories. */
  id: TerritoryId;
  /** Ascending. */
  cells: CellIndex[];
  /** Ascending and symmetric: a lists b iff b lists a. */
  neighbours: TerritoryId[];
  /** Cell where the dice token is drawn. */
  centre: CellIndex;
  owner: PlayerId;
  /** 1..maxDice */
  dice: number;
}

export interface Player {
  /** Equals the player's index in GameState.players, which is turn order. */
  id: PlayerId;
  name: string;
  kind: SeatKind;
  aiLevel?: AiLevel;
  identity: number;
  /** 0..maxReserve */
  reserve: number;
  /** Opponents this player has eliminated. */
  knockouts: number;
  alive: boolean;
}

export interface GameState {
  /** Immutable after createGame; may be shared by reference between states. */
  config: GameConfig;
  /** Immutable after createGame; may be shared by reference between states. */
  board: Board;
  territories: Territory[];
  /** In turn order. */
  players: Player[];
  current: PlayerId;
  /** Starts at 1; +1 each time play wraps from the last alive player back to the first. */
  round: number;
  /** Rng state after the last random draw. */
  rngState: number;
  winner: PlayerId | null;
}

export type Action =
  | { type: 'attack'; from: TerritoryId; to: TerritoryId }
  | { type: 'endTurn' };

export type GameEvent =
  | {
      type: 'attackRolled';
      attacker: PlayerId;
      defender: PlayerId;
      from: TerritoryId;
      to: TerritoryId;
      attackRolls: number[];
      defendRolls: number[];
      attackSum: number;
      defendSum: number;
      success: boolean;
    }
  | { type: 'territoryCaptured'; territory: TerritoryId; previousOwner: PlayerId; newOwner: PlayerId; dice: number }
  | { type: 'playerEliminated'; player: PlayerId; by: PlayerId }
  /** placed: one territory id per die, in placement order. bonus: dice from knockouts. reserve: afterwards. */
  | { type: 'reinforced'; player: PlayerId; largestGroup: number; bonus: number; placed: TerritoryId[]; reserve: number }
  | { type: 'turnStarted'; player: PlayerId; round: number }
  | { type: 'gameOver'; winner: PlayerId };

export type AttackRolledEvent = Extract<GameEvent, { type: 'attackRolled' }>;

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
