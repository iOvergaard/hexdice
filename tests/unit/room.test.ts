import { describe, expect, it } from 'vitest';
import { chooseAction } from '../../src/ai';
import { Rng } from '../../src/engine/rng';
import { applyAction } from '../../src/engine/rules';
import { createGame } from '../../src/engine/setup';
import type { Action, GameState, PlayerId } from '../../src/engine/types';
import { cleanOptions, withSnapshot, type RoomOptions, type ServerMessage } from '../../src/net/protocol';
import { MAX_MISSES, Room, type RoomDeps, type Send } from '../../src/net/room';

const SEED = 123456789;

/** A room on a fake clock; `later` work runs when flush() is called. */
function setup(options: Partial<RoomOptions> = {}) {
  let now = 1_000_000;
  let tokens = 0;
  let seeds = 0;
  const queued: Array<() => void> = [];
  const deps: RoomDeps = {
    seed: () => SEED + seeds++,
    token: () => `token-${++tokens}`,
    now: () => now,
    later: (fn) => queued.push(fn),
  };
  const room = new Room('ABCDE', cleanOptions({ turnSeconds: 0, ...options }), deps);
  return {
    room,
    advance: (ms: number) => {
      now += ms;
      room.tick(now);
    },
    flush: () => {
      while (queued.length) queued.shift()!();
    },
  };
}

/** A client that records what it hears and keeps the game as the host describes it. */
function client() {
  const got: ServerMessage[] = [];
  let state: GameState | null = null;
  let you: PlayerId | null = null;
  const send: Send = (m) => {
    got.push(m);
    if (m.t === 'started') {
      state = m.state;
      you = m.you;
    }
    if (m.t === 'result' && state) state = withSnapshot(state, m.state);
  };
  return {
    send,
    got,
    state: () => state!,
    you: () => you,
    last: <T extends ServerMessage['t']>(t: T) => [...got].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined,
    count: (t: ServerMessage['t']) => got.filter((m) => m.t === t).length,
  };
}

describe('Room', () => {
  it('seats players in the lobby and lets only the first one start', () => {
    const { room } = setup({ seats: 3 });
    const a = client();
    const b = client();
    room.join('Ann', a.send);
    room.join('Ann', b.send);
    expect(a.last('joined')!.seat).toBe(0);
    expect(room.info().seats.map((s) => s.name)).toEqual(['Ann', 'Ann 2']);
    room.start(b.send);
    expect(b.last('error')!.message).toMatch(/Only the player who made the room/);
    room.start(a.send);
    expect(room.status).toBe('playing');
    expect(a.last('started')!.you).not.toBeNull();
  });

  it('turns away a third player from a two-seat room, and anyone once the game is on', () => {
    const { room } = setup({ seats: 2 });
    const [a, b, c] = [client(), client(), client()];
    room.join('A', a.send);
    room.join('B', b.send);
    room.join('C', c.send);
    expect(c.last('error')!.message).toMatch(/full/);
    room.start(a.send);
    room.join('D', client().send);
    expect(room.info().seats).toHaveLength(2);
  });

  it('needs two players unless computer players fill the seats', () => {
    const lonely = setup({ seats: 4 });
    const a = client();
    lonely.room.join('A', a.send);
    lonely.room.start(a.send);
    expect(a.last('error')!.message).toMatch(/at least two/);

    const filled = setup({ seats: 4, fill: 'easy' });
    const b = client();
    filled.room.join('B', b.send);
    filled.room.start(b.send);
    expect(filled.room.info().seats.map((s) => s.kind)).toEqual(['player', 'computer', 'computer', 'computer']);
    // The computer players moved at once, so it's the person's turn now (or the game is over).
    const st = b.state();
    expect(st.winner !== null || st.current === b.you()).toBe(true);
  });

  it('plays only the mover, refuses stale and illegal moves, and prompts again', () => {
    const { room } = setup();
    const [a, b] = [client(), client()];
    room.join('A', a.send);
    room.join('B', b.send);
    room.start(a.send);
    const [mover, other] = a.last('yourTurn') ? [a, b] : [b, a];
    const prompt = mover.last('yourTurn')!;

    room.act(other.send, { type: 'endTurn' });
    expect(other.last('error')!.message).toMatch(/not your turn/);

    room.act(mover.send, { type: 'endTurn' }, prompt.i + 5);
    expect(mover.last('error')!.message).toMatch(/earlier position/);
    expect(mover.count('yourTurn')).toBe(2);

    room.act(mover.send, { type: 'attack', from: 0, to: 0 }, prompt.i);
    expect(mover.last('error')!.message).toMatch(/can't attack/);

    const attack = prompt.legal[0]!;
    room.act(mover.send, { type: 'attack', from: attack.from, to: attack.to }, prompt.i);
    expect(other.last('result')!.action).toEqual({ type: 'attack', from: attack.from, to: attack.to });
    expect(mover.state()).toEqual(other.state());
  });

  it('never sends the seed or the dice state before the game is over, then reveals both so the game replays', () => {
    const { room } = setup({ seats: 3, fill: 'hard' });
    const a = client();
    const w = client();
    room.join('A', a.send);
    room.watch(w.send);
    room.start(a.send);
    const rng = new Rng(7);
    while (room.status === 'playing') {
      const st = a.state();
      if (st.winner !== null) break;
      room.act(a.send, chooseAction(st, 'hard', rng), a.last('yourTurn')!.i);
    }
    const over = a.last('gameOver')!;
    const before = a.got.slice(0, a.got.indexOf(over));
    const wire = JSON.stringify([...before, ...w.got.slice(0, w.got.findIndex((m) => m.t === 'gameOver'))]);
    expect(over.config.seed).toBe(SEED);
    expect(wire).not.toContain(String(SEED));
    for (const m of [...before, ...w.got]) if (m.t === 'started') expect([m.state.config.seed, m.state.rngState]).toEqual([0, 0]);
    expect(wire).not.toMatch(/"rngState":[1-9]/);

    let replay = createGame(over.config);
    for (const action of over.actions) replay = applyAction(replay, action).state;
    expect(replay.winner).toBe(over.winner);
    expect(replay.territories.map((t) => [t.owner, t.dice])).toEqual(a.state().territories.map((t) => [t.owner, t.dice]));
    expect(w.state().territories).toEqual(a.state().territories);
  });

  it('ends a turn that runs out of time, and hands the seat to Hard after three in a row', () => {
    const { room, advance } = setup({ turnSeconds: 10 });
    const [a, b] = [client(), client()];
    room.join('A', a.send);
    room.join('B', b.send);
    room.start(a.send);
    const sleeper = a.last('yourTurn') ? a : b;
    const sleeperSeat = sleeper === a ? 0 : 1;
    const doer = sleeper === a ? b : a;
    for (let miss = 1; miss <= MAX_MISSES; miss++) {
      advance(9_000);
      expect(room.info().seats[sleeperSeat]!.kind).toBe('player');
      advance(1_000);
      expect(sleeper.last('error')!.message).toMatch(/Out of time/);
      if (room.status !== 'playing' || doer.state().winner !== null) return;
      if (miss < MAX_MISSES) room.act(doer.send, { type: 'endTurn' }, doer.last('yourTurn')!.i);
    }
    expect(room.info().seats[sleeperSeat]!.kind).toBe('computer');
  });

  it('plays a whole turn from one message: the attacks still legal, then the end of the turn', () => {
    const { room } = setup();
    const [a, b] = [client(), client()];
    room.join('A', a.send);
    room.join('B', b.send);
    room.start(a.send);
    const mover = a.last('yourTurn') ? a : b;
    const prompt = mover.last('yourTurn')!;
    const pairs: Array<[number, number]> = [[0, 0], ...prompt.legal.slice(0, 2).map((x): [number, number] => [x.from, x.to])];
    const results = mover.count('result');
    room.turn(mover.send, pairs);
    const played = mover.got.slice(0).filter((m) => m.t === 'result').slice(results).map((m) => (m as { action: Action }).action);
    expect(played.at(-1)).toEqual({ type: 'endTurn' });
    expect(played.filter((x) => x.type === 'attack').length).toBeGreaterThanOrEqual(1);
    expect(mover.state().current).not.toBe(mover.you());
  });

  it('plays a series back to back, keeping score, and lets a dropped player take the seat back', () => {
    const { room, flush } = setup({ games: 3 });
    const [a, b] = [client(), client()];
    room.join('A', a.send);
    room.join('B', b.send);
    const tokenB = b.last('joined')!.token;
    room.start(a.send);
    room.disconnect(b.send);
    const b2 = client();
    room.rejoin(tokenB, b2.send);
    expect(b2.last('started')!.you).not.toBeNull();
    const players = [a, b2];
    const rngs = [new Rng(1), new Rng(2)];
    for (let guard = 0; guard < 100_000 && room.status !== 'finished'; guard++) {
      flush();
      const mover = players.find((p) => p.state()?.winner === null && p.state().current === p.you());
      if (!mover) continue;
      room.act(mover.send, chooseAction(mover.state(), 'hard', rngs[players.indexOf(mover)]!), mover.last('yourTurn')!.i);
    }
    const scores = room.info().scores;
    expect(room.status).toBe('finished');
    expect(scores.map((s) => s.games)).toEqual([3, 3]);
    expect(scores[0]!.wins + scores[1]!.wins).toBe(3);
    expect(a.count('gameOver')).toBe(3);
  });

  it('frees a lobby seat on leave and renumbers the seats after it; in a game, Hard takes the seat', () => {
    const { room } = setup({ seats: 3 });
    const [a, b, c] = [client(), client(), client()];
    room.join('A', a.send);
    room.join('B', b.send);
    room.join('C', c.send);
    room.leave(a.send);
    expect(room.info().seats.map((s) => s.name)).toEqual(['B', 'C']);
    expect(c.last('joined')!.seat).toBe(1);
    expect(room.info().owner).toBe(0);
    room.start(b.send);
    room.leave(c.send);
    expect(room.info().seats[1]!.kind).toBe('computer');
    room.rejoin(c.last('joined')!.token, client().send);
    expect(room.info().seats[1]!.kind).toBe('computer');
  });

  it('marks a player away a minute after the connection drops, and is idle once everyone has gone', () => {
    const { room, advance } = setup();
    const a = client();
    room.join('A', a.send);
    room.disconnect(a.send);
    advance(30_000);
    expect(room.info().seats[0]!.connected).toBe(true);
    advance(30_000);
    expect(room.info().seats[0]!.connected).toBe(false);
    expect(room.idle(room.lastActive + 1000, 5000)).toBe(false);
    expect(room.idle(room.lastActive + 5000, 5000)).toBe(true);
  });
});
