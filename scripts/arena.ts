// Agents playing each other online, at speed: a host in this process (or --host), one reference agent per level, each its own
// WebSocket client. The games are split over --rooms rooms played side by side, each room a series.
// Gate: every game finishes, no stall, no rejected move, and replaying each game's revealed seed and moves gives the host's board.
//   npm run arena -- --games 300 --levels hard,normal,easy,easy --rooms 4
import type { AiLevel } from '../src/engine/types';
import { MAX_SEATS, MIN_SEATS } from '../src/net/protocol';
import { playAgent, type AgentReport } from './agent';
import { startHost } from './host';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const games = Number(arg('games', '300'));
const levels = arg('levels', 'hard,normal,easy,easy').split(',') as AiLevel[];
if (levels.length < MIN_SEATS || levels.length > MAX_SEATS || levels.some((l) => !['easy', 'normal', 'hard'].includes(l))) {
  throw new Error(`--levels needs ${MIN_SEATS}–${MAX_SEATS} of easy, normal, hard`);
}
const roomCount = Math.max(1, Math.min(games, Number(arg('rooms', '4'))));
const external = process.argv.includes('--host') ? arg('host', '') : null;
/** No game finishing anywhere for this long counts as a stall. */
const STALL_MS = 20_000;

const host = external ? null : await startHost({ port: 0, quiet: true, maxRooms: roomCount + 10, createsPerMinute: roomCount + 10 });
const url = external ?? `ws://localhost:${host!.port}`;
const started = Date.now();
let lastGame = Date.now();
let finished = 0;

const watchdog = setInterval(() => {
  if (Date.now() - lastGame > STALL_MS) {
    console.error(`ARENA STALLED: no game finished in ${STALL_MS / 1000} s (${finished} of ${games} done)`);
    process.exit(1);
  }
}, 1000);

/** One room's series: the first agent creates the room and starts it once the others are in. Only it checks the replays. */
async function series(room: number, count: number): Promise<AgentReport[]> {
  const name = (i: number): string => `${levels[i]}-${i}`;
  const seed = (i: number): number => room * 100 + i + 1;
  const { code, first } = await new Promise<{ code: string; first: Promise<AgentReport> }>((resolve, reject) => {
    const first = playAgent({
      url,
      name: name(0),
      level: levels[0]!,
      create: { seats: levels.length, games: count, fill: null, turnSeconds: 30 },
      startWhenFull: true,
      seed: seed(0),
      onJoined: (c) => resolve({ code: c, first }),
      onGame: () => {
        lastGame = Date.now();
        finished++;
      },
    });
    first.catch(reject);
  });
  const rest = levels.slice(1).map((level, j) => playAgent({ url, name: name(j + 1), level, room: code, seed: seed(j + 1), verify: false }));
  return Promise.all([first, ...rest]);
}

const per = Array.from({ length: roomCount }, (_, r) => Math.floor(games / roomCount) + (r < games % roomCount ? 1 : 0));
let rooms: AgentReport[][];
try {
  rooms = await Promise.all(per.map((count, r) => series(r, count)));
} finally {
  clearInterval(watchdog);
  await host?.close();
}

const seconds = (Date.now() - started) / 1000;
const reports = rooms.flat();
const desyncs = reports.flatMap((r) => r.desyncs);
const errors = reports.flatMap((r) => r.errors);
const short = rooms.flatMap((agents, r) => agents.filter((a) => a.games !== per[r]));
const wins = levels.map((_, seat) => rooms.reduce((sum, agents) => sum + (agents[0]!.scores[seat]?.wins ?? 0), 0));
console.log(`Arena: ${games} games in ${roomCount} rooms, ${levels.length} agents each (${levels.join(', ')}), ${seconds.toFixed(1)} s, ${(games / seconds).toFixed(1)} games/s`);
levels.forEach((level, seat) => console.log(`  ${`${level}-${seat}`.padEnd(10)} ${wins[seat]} wins (${((wins[seat]! / games) * 100).toFixed(1)}%)`));
console.log(`desyncs ${desyncs.length}, rejected or late moves ${errors.length}, agents short of their games ${short.length}`);
for (const d of desyncs.slice(0, 5)) console.error(`desync: ${d}`);
for (const e of [...new Set(errors)].slice(0, 5)) console.error(`error: ${e}`);
if (desyncs.length || errors.length || short.length || finished !== games) {
  console.error('ARENA FAILED');
  process.exit(1);
}
