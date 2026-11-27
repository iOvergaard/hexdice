// Reference agent: plays a host's room through the public protocol only, choosing moves with the built-in AIs.
// The worked example for agent authors (docs/online.md). Run it on its own:
//   npm run agent -- --host ws://localhost:8787 --room ABCDE --name Atlas --level hard
//   npm run agent -- --host ws://localhost:8787 --create --seats 4 --games 100 --name Atlas   (prints the room code; starts when full)
import { pathToFileURL } from 'node:url';
import { chooseAction } from '../src/ai';
import { Rng } from '../src/engine/rng';
import { applyAction } from '../src/engine/rules';
import { createGame } from '../src/engine/setup';
import type { AiLevel, GameState, PlayerId } from '../src/engine/types';
import { boardDiff } from '../src/game/log-check';
import { Connection } from '../src/net/client';
import { cleanOptions, withSnapshot, type RoomOptions, type Score, type ServerMessage } from '../src/net/protocol';

export interface AgentOptions {
  url: string;
  name: string;
  level: AiLevel;
  /** Join this room; without it the agent creates one with `create`. */
  room?: string;
  create?: Partial<RoomOptions>;
  /** Start the room once every seat is taken (only the room's creator may). */
  startWhenFull?: boolean;
  /** Seed for the agent's own move choices. */
  seed?: number;
  /** Replay each finished game from its revealed seed and actions, and compare the board (default true). */
  verify?: boolean;
  onJoined?: (room: string) => void;
  onGame?: (game: number) => void;
}

export interface AgentReport {
  room: string;
  /** Games this agent saw to the end. */
  games: number;
  /** Games where replaying the revealed seed and actions didn't give the board the host sent. */
  desyncs: string[];
  /** Every error the host sent this agent. */
  errors: string[];
  scores: Score[];
}

/** Plays until the room's last game ends; rejects if the connection drops before that. */
export function playAgent(o: AgentOptions): Promise<AgentReport> {
  return new Promise((resolve, reject) => {
    const rng = new Rng(o.seed ?? 1);
    const report: AgentReport = { room: o.room ?? '', games: 0, desyncs: [], errors: [], scores: [] };
    let state: GameState | null = null;
    let you: PlayerId | null = null;
    let started = false;
    let done = false;

    const onMessage = (m: ServerMessage): void => {
      switch (m.t) {
        case 'joined':
          if (!report.room) o.onJoined?.(m.room);
          report.room = m.room;
          return;
        case 'room':
          if (o.startWhenFull && !started && m.room.status === 'lobby' && m.room.seats.length === m.room.options.seats) {
            started = true;
            conn.send({ t: 'start' });
          }
          return;
        case 'started':
          state = m.state;
          you = m.you;
          return;
        case 'result':
          if (state) state = withSnapshot(state, m.state);
          return;
        case 'yourTurn':
          if (state && state.current === you) conn.send({ t: 'act', action: chooseAction(state, o.level, rng), i: m.i });
          return;
        case 'gameOver': {
          report.games++;
          if (o.verify !== false) {
            let replay = createGame(m.config);
            for (const a of m.actions) replay = applyAction(replay, a).state;
            const diff = state ? boardDiff(replay, { ...state, rngState: replay.rngState }) : ['no state'];
            if (diff.length) report.desyncs.push(`game ${m.game}: ${diff.slice(0, 3).join('; ')}`);
          }
          o.onGame?.(m.game);
          if (m.room.status === 'finished') {
            done = true;
            report.scores = m.room.scores;
            conn.close();
            resolve(report);
          }
          return;
        }
        case 'error':
          report.errors.push(m.message);
          return;
        default:
      }
    };

    const conn = new Connection(o.url, onMessage, () => {
      if (!done) reject(new Error(`${o.name}: connection closed before the room finished`));
    });
    conn.opened.then(
      () => conn.send(o.room ? { t: 'join', room: o.room, name: o.name } : { t: 'create', name: o.name, options: o.create ?? {} }),
      reject,
    );
  });
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const level = (arg('level') ?? 'hard') as AiLevel;
  const create = process.argv.includes('--create');
  const options = cleanOptions({ seats: Number(arg('seats') ?? 2), games: Number(arg('games') ?? 1), turnSeconds: Number(arg('turn') ?? 30), fill: arg('fill') ?? null });
  playAgent({
    url: arg('host') ?? 'ws://localhost:8787',
    name: arg('name') ?? `Agent ${level}`,
    level,
    room: create ? undefined : arg('room'),
    create: options,
    startWhenFull: create,
    seed: Number(arg('seed') ?? Date.now() % 2 ** 32),
    onJoined: (room) => console.log(`Room ${room}`),
  }).then(
    (r) => {
      console.log(`Played ${r.games} games in room ${r.room}; ${r.desyncs.length} desyncs, ${r.errors.length} errors`);
      for (const s of r.scores) console.log(`  ${s.name}: ${s.wins}/${s.games} wins`);
      process.exit(r.desyncs.length ? 1 : 0);
    },
    (e: Error) => {
      console.error(e.message);
      process.exit(1);
    },
  );
}
