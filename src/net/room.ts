// One online room: seats, turns, deadlines, take-overs and series. Pure: no sockets, timers or Math.random();
// the host (scripts/host.ts) passes in how to send, what time it is and where secrets come from.
import { chooseAction } from '../ai';
import { makeConfig } from '../engine/config';
import { Rng } from '../engine/rng';
import { applyAction, attackOdds, isLegalAttack, legalAttacks } from '../engine/rules';
import { AI_NAMES } from '../engine/seats';
import { createGame } from '../engine/setup';
import type { Action, AiLevel, GameConfig, GameState, PlayerId, SeatConfig, TerritoryId } from '../engine/types';
import { hidden, snapshot, type RoomInfo, type RoomOptions, type ServerMessage } from './protocol';

export type Send = (msg: ServerMessage) => void;

export interface RoomDeps {
  /** A fresh, secret uint32 for each game. */
  seed(): number;
  /** An unguessable seat token. */
  token(): string;
  now(): number;
  /** Runs `fn` once the current message is handled: the next game of a series starts there, not inside the last move. */
  later(fn: () => void): void;
}

/** How long a player's connection may be gone before the others see them as away. */
export const AWAY_MS = 60_000;
/** Turns in a row a seat may run out of time before the host's Hard player takes it over. */
export const MAX_MISSES = 3;
/** The level that takes over a seat whose player left or kept running out of time. */
const TAKE_OVER: AiLevel = 'hard';

interface Seat {
  name: string;
  /** '' once the player has left: nobody can take the seat back. */
  token: string;
  send: Send | null;
  /** Set for a computer player: a fill seat, or one the host took over. */
  computer: AiLevel | null;
  misses: number;
  goneAt: number | null;
  away: boolean;
  wins: number;
  games: number;
}

export class Room {
  status: RoomInfo['status'] = 'lobby';
  lastActive: number;
  private seats: Seat[] = [];
  private owner: number | null = null;
  private readonly watchers = new Set<Send>();
  /** Games started in this room, and in the current run of `options.games` (a rematch starts a new run). */
  private game = 0;
  private run = 0;
  private config: GameConfig | null = null;
  private state: GameState | null = null;
  private actions: Action[] = [];
  private aiRng = new Rng(0);
  /** Round and player of the turn the deadline belongs to. */
  private turnKey = '';
  private deadline: number | null = null;

  constructor(
    readonly code: string,
    readonly options: RoomOptions,
    private readonly deps: RoomDeps,
  ) {
    this.lastActive = deps.now();
  }

  // ---- membership ----

  join(name: string, send: Send): void {
    if (this.status !== 'lobby') return send({ t: 'error', message: 'That game has already started' });
    if (this.seats.length >= this.options.seats) return send({ t: 'error', message: 'That room is full' });
    const token = this.deps.token();
    this.seats.push({ name: this.uniqueName(name), token, send, computer: null, misses: 0, goneAt: null, away: false, wins: 0, games: 0 });
    const seat = this.seats.length - 1;
    this.owner ??= seat;
    this.touch();
    send({ t: 'joined', room: this.code, token, seat });
    this.broadcastRoom();
  }

  /** Takes back a seat after a dropped connection. */
  rejoin(token: string, send: Send): void {
    const seat = token ? this.seats.findIndex((s) => s.token === token) : -1;
    if (seat < 0) return send({ t: 'error', message: 'That seat is not yours, or no longer exists' });
    const s = this.seats[seat]!;
    s.send?.({ t: 'error', message: 'You joined this room from somewhere else' });
    s.send = send;
    s.goneAt = null;
    const wasAway = s.away;
    s.away = false;
    this.touch();
    send({ t: 'joined', room: this.code, token, seat });
    if (wasAway) this.broadcastRoom();
    else send({ t: 'room', room: this.info() });
    if (this.status === 'playing' && this.state) {
      send({ t: 'started', game: this.game, state: hidden(this.state), you: this.playerOf(seat), i: this.actions.length });
      if (this.state.winner === null && this.seatOf(this.state.current) === seat) this.prompt();
    }
  }

  watch(send: Send): void {
    this.watchers.add(send);
    this.touch();
    this.broadcastRoom();
    if (this.status === 'playing' && this.state) send({ t: 'started', game: this.game, state: hidden(this.state), you: null, i: this.actions.length });
  }

  /** The connection dropped: the seat stays theirs, and the clock keeps running. */
  disconnect(send: Send): void {
    this.touch();
    if (this.watchers.delete(send)) return this.broadcastRoom();
    const s = this.seats.find((x) => x.send === send);
    if (!s) return;
    s.send = null;
    s.goneAt = this.deps.now();
  }

  /** Leaving in the lobby frees the seat; leaving a game hands it to the host's Hard player. */
  leave(send: Send): void {
    this.touch();
    if (this.watchers.delete(send)) return this.broadcastRoom();
    const seat = this.seatIndex(send);
    if (seat < 0) return;
    if (this.status === 'lobby') {
      this.seats.splice(seat, 1);
      // Seat numbers after it move up one: tell those players their new number.
      this.seats.forEach((s, i) => {
        if (i >= seat) s.send?.({ t: 'joined', room: this.code, token: s.token, seat: i });
      });
      if (this.owner === seat) this.owner = this.seats.length > 0 ? 0 : null;
      else if (this.owner !== null && this.owner > seat) this.owner--;
    } else {
      const s = this.seats[seat]!;
      s.token = '';
      s.send = null;
      s.computer ??= TAKE_OVER;
      if (this.owner === seat) {
        const next = this.seats.findIndex((x) => !x.computer);
        this.owner = next < 0 ? null : next;
      }
    }
    this.broadcastRoom();
    const st = this.state;
    if (this.status === 'playing' && st && st.winner === null && this.seatOf(st.current) === seat) this.advance();
  }

  /** Nobody is connected and nothing has happened for `ms`. */
  idle(now: number, ms: number): boolean {
    return this.watchers.size === 0 && this.seats.every((s) => !s.send) && now - this.lastActive >= ms;
  }

  // ---- play ----

  start(send: Send): void {
    const seat = this.seatIndex(send);
    if (seat < 0 || seat !== this.owner) return send({ t: 'error', message: 'Only the player who made the room can start it' });
    if (this.status === 'playing') return send({ t: 'error', message: 'The game is already on' });
    if (this.status === 'lobby' && this.options.fill) {
      const level = this.options.fill;
      const names = AI_NAMES.filter((n) => !this.seats.some((s) => s.name === n));
      while (this.seats.length < this.options.seats) {
        this.seats.push({ name: names.shift() ?? `Computer ${this.seats.length + 1}`, token: '', send: null, computer: level, misses: 0, goneAt: null, away: false, wins: 0, games: 0 });
      }
    }
    if (this.seats.length < 2) return send({ t: 'error', message: 'A game needs at least two players' });
    this.run = 0;
    this.begin();
  }

  act(send: Send, action: Action, i?: number): void {
    const seat = this.mover(send);
    if (seat < 0) return;
    if (i !== undefined && i !== this.actions.length) return this.refuse(send, 'That move was for an earlier position');
    if (action.type === 'attack' && !isLegalAttack(this.state!, action.from, action.to)) return this.refuse(send, `You can't attack ${action.to} from ${action.from}`);
    this.seats[seat]!.misses = 0;
    this.apply(action);
    this.advance();
  }

  /** A whole turn: each attack still legal by then is played, in order, then the turn ends. */
  turn(send: Send, attacks: ReadonlyArray<readonly [TerritoryId, TerritoryId]>): void {
    const seat = this.mover(send);
    if (seat < 0) return;
    this.seats[seat]!.misses = 0;
    for (const [from, to] of attacks) {
      if (this.state!.winner !== null) break;
      if (isLegalAttack(this.state!, from, to)) this.apply({ type: 'attack', from, to });
    }
    if (this.state!.winner === null) this.apply({ type: 'endTurn' });
    this.advance();
  }

  /** Called a few times a second: deadlines and away notices. */
  tick(now: number): void {
    let changed = false;
    for (const s of this.seats) {
      if (s.goneAt !== null && !s.away && now - s.goneAt >= AWAY_MS) {
        s.away = true;
        changed = true;
      }
    }
    const st = this.state;
    if (this.status === 'playing' && st && st.winner === null && this.deadline !== null && now >= this.deadline) {
      const s = this.seats[this.seatOf(st.current)]!;
      s.misses++;
      if (s.misses >= MAX_MISSES && !s.computer) {
        s.computer = TAKE_OVER;
        changed = true;
      }
      if (changed) this.broadcastRoom();
      s.send?.({ t: 'error', message: 'Out of time: your turn was ended for you' });
      this.apply({ type: 'endTurn' });
      this.advance();
      return;
    }
    if (changed) this.broadcastRoom();
  }

  info(): RoomInfo {
    return {
      code: this.code,
      status: this.status,
      options: this.options,
      seats: this.seats.map((s, seat) => ({ seat, name: s.name, kind: s.computer ? 'computer' : 'player', connected: !!s.computer || !s.away })),
      owner: this.owner,
      game: this.game,
      scores: this.seats.map((s, seat) => ({ seat, name: s.name, wins: s.wins, games: s.games })),
      watchers: this.watchers.size,
    };
  }

  // ---- internals ----

  private begin(): void {
    this.game++;
    this.run++;
    const seats = this.seats.map((s, identity): SeatConfig => (s.computer ? { name: s.name, kind: 'ai', aiLevel: s.computer, identity } : { name: s.name, kind: 'human', identity }));
    this.config = makeConfig(seats, this.deps.seed());
    this.state = createGame(this.config);
    this.actions = [];
    // ponytail: the dice generator is mulberry32, one uint32 of state. A client that saw enough rolls could brute-force it
    // and foresee the next ones. Upgrade if it matters: reseed each turn from the host's crypto source and reveal the seeds at the end.
    this.aiRng = new Rng(this.config.seed ^ 0x9e3779b9);
    this.turnKey = '';
    this.deadline = null;
    this.status = 'playing';
    this.touch();
    this.broadcastRoom();
    const state = hidden(this.state);
    this.seats.forEach((s, seat) => s.send?.({ t: 'started', game: this.game, state, you: this.playerOf(seat), i: 0 }));
    for (const w of this.watchers) w({ t: 'started', game: this.game, state, you: null, i: 0 });
    this.advance();
  }

  private apply(action: Action): void {
    const { state, events } = applyAction(this.state!, action);
    this.state = state;
    const i = this.actions.length;
    this.actions.push(action);
    this.broadcast({ t: 'result', i, action, events, state: snapshot(state) });
  }

  /** Computer seats move at once; then the seat whose turn it is hears about it. */
  private advance(): void {
    for (;;) {
      const st = this.state!;
      if (st.winner !== null) return this.finish();
      const s = this.seats[this.seatOf(st.current)]!;
      if (!s.computer) break;
      this.apply(chooseAction(st, s.computer, this.aiRng));
    }
    const st = this.state!;
    const key = `${st.round}:${st.current}`;
    if (key !== this.turnKey) {
      this.turnKey = key;
      this.deadline = this.options.turnSeconds > 0 ? this.deps.now() + this.options.turnSeconds * 1000 : null;
    }
    this.prompt();
  }

  private prompt(): void {
    const st = this.state!;
    const legal = legalAttacks(st).map((a) => ({ ...a, odds: attackOdds(st, a.from, a.to) }));
    this.seats[this.seatOf(st.current)]!.send?.({ t: 'yourTurn', i: this.actions.length, legal, deadline: this.deadline });
  }

  private finish(): void {
    const st = this.state!;
    const winnerSeat = this.seatOf(st.winner!);
    this.seats.forEach((s, seat) => {
      s.games++;
      if (seat === winnerSeat) s.wins++;
    });
    this.deadline = null;
    const more = this.run < this.options.games;
    if (!more) this.status = 'finished';
    this.broadcast({ t: 'gameOver', game: this.game, winner: st.winner!, config: this.config!, actions: this.actions, room: this.info() });
    if (more) {
      const game = this.game;
      this.deps.later(() => {
        if (this.game === game && this.status === 'playing') this.begin();
      });
    }
  }

  /** The seat that may move now, or -1 after telling the sender why not. */
  private mover(send: Send): number {
    const seat = this.seatIndex(send);
    const st = this.state;
    if (seat < 0) send({ t: 'error', message: 'You have no seat in this room' });
    else if (this.status !== 'playing' || !st || st.winner !== null) send({ t: 'error', message: 'No game is on' });
    else if (this.seatOf(st.current) !== seat || this.seats[seat]!.computer) send({ t: 'error', message: 'It is not your turn' });
    else {
      this.touch();
      return seat;
    }
    return -1;
  }

  private refuse(send: Send, message: string): void {
    send({ t: 'error', message });
    this.prompt();
  }

  private seatIndex(send: Send): number {
    return this.seats.findIndex((s) => s.send === send);
  }

  private playerOf(seat: number): PlayerId {
    return this.state!.players.findIndex((p) => p.identity === seat);
  }

  private seatOf(player: PlayerId): number {
    return this.state!.players[player]!.identity;
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.seats.map((s) => s.name));
    if (!taken.has(name)) return name;
    let n = 2;
    while (taken.has(`${name} ${n}`)) n++;
    return `${name} ${n}`;
  }

  private broadcast(msg: ServerMessage): void {
    for (const s of this.seats) s.send?.(msg);
    for (const w of this.watchers) w(msg);
  }

  private broadcastRoom(): void {
    this.broadcast({ t: 'room', room: this.info() });
  }

  private touch(): void {
    this.lastActive = this.deps.now();
  }
}
