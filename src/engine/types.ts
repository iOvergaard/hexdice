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
/**
 * Where reinforcement dice land. 'random': any own territory with room. 'frontline': only territories facing an enemy
 * (what doesn't fit: `FrontlineOverflow`). 'weighted': territories facing an enemy are three times as likely.
 */
export type ReinforcementRule = 'random' | 'frontline' | 'weighted';
/**
 * Where front-line reinforcements that don't fit go. 'behind': onto your territories behind the front, nearest it first,
 * and only then the reserve. 'reserve': straight to the reserve. Only used with 'frontline' reinforcement.
 */
export type FrontlineOverflow = 'behind' | 'reserve';
/**
 * Dice for a capture that joins two or more of your groups, placed on the linking territory (overflow to the reserve).
 * 'flat': 2 per extra group joined. 'smaller': the size of every joined group except the largest.
 * 'catchup': 2 per extra group joined, only for a player holding fewer territories than the average of those alive.
 */
export type ConnectionBonusRule = 'off' | 'flat' | 'smaller' | 'catchup';

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
  /** One-cell-wide rivers from the coast inland, each riverLengthMin..riverLengthMax cells, crossable only at fords. */
  riverCount: number;
  riverLengthMin: number;
  riverLengthMax: number;
  fordsPerRiver: number;
  maxDice: number;
  maxReserve: number;
  lossRule: LossRule;
  reinforcement: ReinforcementRule;
  frontlineOverflow: FrontlineOverflow;
  connectionBonus: ConnectionBonusRule;
  /** Extra dice per reinforcement, permanently, for each opponent the player has knocked out. */
  eliminationBonus: number;
  /**
   * Dice added to each territory of the last two players' smaller one (fewer territories; nobody on a tie), once,
   * when a turn first ends with two players left in a game that started with three or more. 0 turns it off.
   */
  lastStandDice: number;
  /** Starting dice per player: floor(startingDiceFactor * territoryCount / players). */
  startingDiceFactor: number;
  /** Adjust each seat's starting dice by turn order (`SEAT_COMPENSATION`), so where you sit doesn't decide the game. */
  seatCompensation: boolean;
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
  /** Land cells left in rivers as crossings, for drawing. */
  fords?: CellIndex[];
  /** Each river's cells from mouth to source, fords included, for drawing. */
  rivers?: CellIndex[][];
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
  /** A turn has ended with two players left, so the last stand is spent; true from the start with two seats. */
  finalStarted: boolean;
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
  /** A capture joined `groups` of the player's groups; `bonus` dice went on the territory, `toReserve` past the cap. */
  | { type: 'linked'; player: PlayerId; territory: TerritoryId; groups: number; bonus: number; toReserve: number }
  /** The smaller of the last two players gained dice on each territory, up to the cap. placed: one territory id per die. */
  | { type: 'lastStand'; player: PlayerId; placed: TerritoryId[] }
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
