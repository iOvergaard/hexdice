// Online play: the messages between a host (scripts/host.ts) and its clients (browsers, agents, watchers).
// JSON over one WebSocket. docs/online.md is the guide for agent authors; change both together.
import type { Action, AiLevel, GameConfig, GameEvent, GameState, Player, PlayerId, TerritoryId } from '../engine/types';

export const MIN_SEATS = 2;
export const MAX_SEATS = 8;
export const MAX_GAMES = 1000;
export const MAX_NAME = 20;

export interface RoomOptions {
  /** Seats for people, agents and computer players together, 2–8. */
  seats: number;
  /** Computer players for the seats nobody took when the game starts; null leaves those seats out. */
  fill: AiLevel | null;
  /** Seconds each seat has for its whole turn; 0 for no limit. */
  turnSeconds: number;
  /** Games the room plays back to back, 1–1000. */
  games: number;
}

export const DEFAULT_ROOM: Readonly<RoomOptions> = { seats: 2, fill: null, turnSeconds: 60, games: 1 };

export interface SeatInfo {
  seat: number;
  name: string;
  /** 'computer' for a fill seat, and for a seat the host took over after its player left or kept missing turns. */
  kind: 'player' | 'computer';
  /** False once a player's connection has been gone a while. */
  connected: boolean;
}

export interface Score {
  seat: number;
  name: string;
  wins: number;
  games: number;
}

export interface RoomInfo {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  options: RoomOptions;
  seats: SeatInfo[];
  /** Seat that may start the game; null when nobody is left to. */
  owner: number | null;
  /** Games started so far. */
  game: number;
  scores: Score[];
  watchers: number;
}

/** What changes as a game goes on. The board, the territories' shapes and the config are sent once, in `started`. */
export interface Snapshot {
  owner: PlayerId[];
  dice: number[];
  players: Player[];
  current: PlayerId;
  round: number;
  winner: PlayerId | null;
  finalStarted: boolean;
  spent: TerritoryId[];
  shaken: TerritoryId[];
}

export interface LegalAttack {
  from: TerritoryId;
  to: TerritoryId;
  /** Chance the attack captures. */
  odds: number;
}

export type ClientMessage =
  | { t: 'rooms' }
  | { t: 'create'; name: string; options: Partial<RoomOptions> }
  /** With a token, takes back your seat after a dropped connection; without, takes a free seat in the lobby. */
  | { t: 'join'; room: string; name: string; token?: string }
  | { t: 'watch'; room: string }
  | { t: 'start' }
  /** `i`, when given, must be the `i` of your latest `yourTurn`, so a stale action is refused rather than played. */
  | { t: 'act'; action: Action; i?: number }
  /** A whole turn in one message: each attack that is still legal is played in order, then the turn ends. */
  | { t: 'turn'; attacks: Array<[TerritoryId, TerritoryId]> }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'rooms'; rooms: RoomInfo[] }
  | { t: 'joined'; room: string; token: string; seat: number }
  | { t: 'room'; room: RoomInfo }
  /** A game began, or you (re)joined one in progress. `state` has its seed and dice state blanked; `i` actions are behind it. */
  | { t: 'started'; game: number; state: GameState; you: PlayerId | null; i: number }
  /** Action number `i` of this game (from 0), what it caused, and the state after it. */
  | { t: 'result'; i: number; action: Action; events: GameEvent[]; state: Snapshot }
  /** Your move. `deadline` is a Unix time in ms, or null with no turn limit. */
  | { t: 'yourTurn'; i: number; legal: LegalAttack[]; deadline: number | null }
  /** The seed and every action, so anyone can replay the game and check the host's dice. */
  | { t: 'gameOver'; game: number; winner: PlayerId; config: GameConfig; actions: Action[]; room: RoomInfo }
  | { t: 'error'; message: string };

/** The state with the seed and the dice generator's state blanked, safe to send while the game is on. */
export function hidden(state: GameState): GameState {
  return { ...state, rngState: 0, config: { ...state.config, seed: 0 } };
}

export function snapshot(state: GameState): Snapshot {
  return {
    owner: state.territories.map((t) => t.owner),
    dice: state.territories.map((t) => t.dice),
    players: state.players,
    current: state.current,
    round: state.round,
    winner: state.winner,
    finalStarted: state.finalStarted,
    spent: state.spent,
    shaken: state.shaken,
  };
}

/** `base` moved on to `s`: the territories' shapes, the board and the config stay as they were. */
export function withSnapshot(base: GameState, s: Snapshot): GameState {
  return {
    ...base,
    territories: base.territories.map((t, i) => ({ ...t, owner: s.owner[i]!, dice: s.dice[i]! })),
    players: s.players.map((p) => ({ ...p })),
    current: s.current,
    round: s.round,
    winner: s.winner,
    finalStarted: s.finalStarted,
    spent: [...s.spent],
    shaken: [...s.shaken],
  };
}

const LEVELS: readonly string[] = ['easy', 'normal', 'hard'];
const int = (x: unknown): x is number => Number.isInteger(x);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** A trimmed name without control characters, at most MAX_NAME long; null if nothing is left. */
export function cleanName(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const s = x.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
  return s.length > 0 ? s : null;
}

export function cleanOptions(x: unknown): RoomOptions {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
  return {
    seats: int(o.seats) ? clamp(o.seats, MIN_SEATS, MAX_SEATS) : DEFAULT_ROOM.seats,
    fill: typeof o.fill === 'string' && LEVELS.includes(o.fill) ? (o.fill as AiLevel) : null,
    turnSeconds: int(o.turnSeconds) ? clamp(o.turnSeconds, 0, 3600) : DEFAULT_ROOM.turnSeconds,
    games: int(o.games) ? clamp(o.games, 1, MAX_GAMES) : DEFAULT_ROOM.games,
  };
}

const ROOM_CODE = /^[A-Z0-9]{4,8}$/;

export function cleanRoomCode(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const s = x.trim().toUpperCase();
  return ROOM_CODE.test(s) ? s : null;
}

/** Reads one message from a client. Anything malformed gives null: the host answers it with an error, never a crash. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    m = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (m.t) {
    case 'rooms':
    case 'start':
    case 'leave':
      return { t: m.t };
    case 'create': {
      const name = cleanName(m.name);
      return name ? { t: 'create', name, options: cleanOptions(m.options) } : null;
    }
    case 'join': {
      const room = cleanRoomCode(m.room);
      const name = cleanName(m.name) ?? 'Player';
      if (!room) return null;
      return typeof m.token === 'string' && m.token.length <= 64 ? { t: 'join', room, name, token: m.token } : { t: 'join', room, name };
    }
    case 'watch': {
      const room = cleanRoomCode(m.room);
      return room ? { t: 'watch', room } : null;
    }
    case 'act': {
      const a = m.action as Record<string, unknown> | null | undefined;
      if (typeof a !== 'object' || a === null) return null;
      const i = int(m.i) ? { i: m.i } : {};
      if (a.type === 'endTurn') return { t: 'act', action: { type: 'endTurn' }, ...i };
      if (a.type === 'attack' && int(a.from) && int(a.to)) return { t: 'act', action: { type: 'attack', from: a.from, to: a.to }, ...i };
      return null;
    }
    case 'turn': {
      if (!Array.isArray(m.attacks) || m.attacks.length > 200) return null;
      const attacks: Array<[TerritoryId, TerritoryId]> = [];
      for (const pair of m.attacks) {
        if (!Array.isArray(pair) || pair.length !== 2 || !int(pair[0]) || !int(pair[1])) return null;
        attacks.push([pair[0], pair[1]]);
      }
      return { t: 'turn', attacks };
    }
    default:
      return null;
  }
}
