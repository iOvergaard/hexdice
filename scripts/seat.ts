// A seat you drive one command at a time: for LLM agents and people at a terminal. Each command connects, takes the seat back
// with its token (kept in --file), does one thing, prints the position in plain text and disconnects. docs/online.md has the guide.
//   npm run seat -- join ABCDE --host ws://localhost:8787 --name Claude
//   npm run seat -- create --host ws://localhost:8787 --name Claude --seats 2 --turn 0
//   npm run seat -- wait            (until it's your turn or the game ends)
//   npm run seat -- attack 3 7      (then shows the position again)
//   npm run seat -- end             (ends your turn and waits for the next one)
//   npm run seat -- turn 3:7,5:9    (those attacks while still legal, then ends the turn and waits)
//   npm run seat -- start | show | leave
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { largestGroup } from '../src/engine/rules';
import type { GameEvent, GameState, PlayerId } from '../src/engine/types';
import { Connection } from '../src/net/client';
import { cleanOptions, withSnapshot, type ClientMessage, type LegalAttack, type RoomInfo, type ServerMessage } from '../src/net/protocol';

interface SeatFile {
  host: string;
  room: string;
  token: string;
}

const argv = process.argv.slice(2);
function opt(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1]!.startsWith('--')));
const [command = 'show', ...rest] = positional;
const file = opt('file') ?? join(tmpdir(), 'hexdice-seat.json');
/** Stays under a 10-minute tool timeout; run `wait` again after it. */
const timeoutMs = Number(opt('timeout') ?? 540) * 1000;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** One connection, its messages in order, and the game as last seen. */
class Link {
  state: GameState | null = null;
  you: PlayerId | null = null;
  room: RoomInfo | null = null;
  turn: { i: number; legal: LegalAttack[]; deadline: number | null } | null = null;
  over: Extract<ServerMessage, { t: 'gameOver' }> | null = null;
  /** What happened since this command connected, one line each. */
  lines: string[] = [];
  private readonly queue: ServerMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  private readonly conn: Connection;

  constructor(url: string) {
    this.conn = new Connection(
      url,
      (m) => {
        this.queue.push(m);
        this.wake?.();
      },
      () => {
        this.closed = true;
        this.wake?.();
      },
    );
  }

  async open(): Promise<void> {
    await this.conn.opened.catch((e: Error) => fail(e.message));
  }

  send(m: ClientMessage): void {
    this.conn.send(m);
  }

  close(): void {
    this.conn.close();
  }

  /** Reads messages until `done` says stop; false on timeout or a dropped connection. */
  async until(done: (m: ServerMessage) => boolean, ms = timeoutMs): Promise<boolean> {
    const end = Date.now() + ms;
    for (;;) {
      const m = this.queue.shift();
      if (m) {
        this.track(m);
        if (done(m)) return true;
        continue;
      }
      if (this.closed || Date.now() >= end) return false;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        setTimeout(resolve, Math.min(1000, end - Date.now()));
      });
      this.wake = null;
    }
  }

  private track(m: ServerMessage): void {
    switch (m.t) {
      case 'room':
        this.room = m.room;
        return;
      case 'started':
        this.state = m.state;
        this.you = m.you;
        this.turn = null;
        this.over = null;
        if (m.i === 0) this.lines.push(`Game ${m.game} started.`);
        return;
      case 'result': {
        const before = this.state;
        if (!before) return;
        this.state = withSnapshot(before, m.state);
        this.turn = null;
        for (const e of m.events) {
          const line = describe(before, e, this.you);
          if (line) this.lines.push(line);
        }
        return;
      }
      case 'yourTurn':
        this.turn = { i: m.i, legal: m.legal, deadline: m.deadline };
        return;
      case 'gameOver':
        this.over = m;
        this.room = m.room;
        return;
      case 'error':
        this.lines.push(`Host: ${m.message}`);
        return;
      default:
    }
  }
}

function who(state: GameState, id: PlayerId, you: PlayerId | null): string {
  return id === you ? 'You' : state.players[id]!.name;
}

function describe(s: GameState, e: GameEvent, you: PlayerId | null): string | null {
  switch (e.type) {
    case 'attackRolled':
      return `${who(s, e.attacker, you)} attacked ${e.to} (${who(s, e.defender, you)}) from ${e.from}: ${e.attackRolls.length} dice rolled ${e.attackSum} v ${e.defendRolls.length} rolled ${e.defendSum}, ${e.success ? 'captured' : 'held'}.`;
    case 'reinforced':
      return `${who(s, e.player, you)} ended the turn: +${e.placed.length} dice${e.reserve ? `, ${e.reserve} in reserve` : ''}.`;
    case 'playerEliminated':
      return `${who(s, e.player, you)} knocked out by ${who(s, e.by, you)}.`;
    case 'linked':
      return `${who(s, e.player, you)} joined ${e.groups} groups at ${e.territory}: +${e.bonus} dice.`;
    case 'lastStand':
      return `Last stand: ${who(s, e.player, you)} +1 die on each territory.`;
    default:
      return null;
  }
}

function position(link: Link): string {
  const s = link.state;
  if (!s) return link.room ? lobby(link.room) : 'No game yet.';
  const you = link.you;
  const out: string[] = [];
  const held = s.players.map((p) => s.territories.filter((t) => t.owner === p.id));
  out.push(`Round ${s.round}. ${s.winner !== null ? `${who(s, s.winner, you)} won.` : s.current === you ? 'Your turn.' : `${s.players[s.current]!.name} to play.`}`);
  out.push(
    'Players, in turn order: ' +
      s.players
        .map((p) =>
          p.alive
            ? `${who(s, p.id, you)} ${held[p.id]!.length} territories, ${held[p.id]!.reduce((a, t) => a + t.dice, 0)} dice, largest group ${largestGroup(s, p.id)}${p.reserve ? `, reserve ${p.reserve}` : ''}`
            : `${who(s, p.id, you)} out`,
        )
        .join(' | '),
  );
  if (you !== null && s.players[you]!.alive) {
    out.push('Your territories (id: dice; neighbours as id owner dice):');
    for (const t of held[you]!) {
      const ns = t.neighbours.map((n) => {
        const u = s.territories[n]!;
        return `${n} ${u.owner === you ? 'you' : s.players[u.owner]!.name} ${u.dice}`;
      });
      out.push(`  ${t.id}: ${t.dice}${s.spent.includes(t.id) ? ' (spent this turn)' : ''} | ${ns.join(', ')}`);
    }
  }
  if (link.turn && s.winner === null) {
    const { legal, deadline } = link.turn;
    out.push(deadline ? `Turn ends by itself in ${Math.max(0, Math.round((deadline - Date.now()) / 1000))} s.` : 'No turn limit.');
    out.push(
      legal.length
        ? `Legal attacks (from>to: your dice v theirs, chance to capture): ${legal
            .sort((a, b) => b.odds - a.odds)
            .map((a) => `${a.from}>${a.to}: ${s.territories[a.from]!.dice}v${s.territories[a.to]!.dice} ${Math.round(a.odds * 100)}%`)
            .join(', ')}`
        : 'No legal attacks: end your turn.',
    );
    out.push('Next: attack FROM TO | turn A:B,C:D | end');
  }
  return out.join('\n');
}

function lobby(r: RoomInfo): string {
  const seats = r.seats.map((s) => `${s.name}${s.kind === 'computer' ? ' (computer)' : s.connected ? '' : ' (away)'}`).join(', ');
  return `Room ${r.code}: ${r.status}, ${r.seats.length}/${r.options.seats} seats: ${seats}. Game ${r.game} of ${r.options.games}.`;
}

function report(link: Link, extra?: string): void {
  const lines = link.lines.slice(-40);
  if (link.lines.length > lines.length) console.log(`(${link.lines.length - lines.length} earlier lines left out)`);
  for (const l of lines) console.log(l);
  if (extra) console.log(extra);
  if (link.over) {
    const s = link.state!;
    console.log(`Game over: ${who(s, link.over.winner, link.you)} won. Seed ${link.over.config.seed}, ${link.over.actions.length} moves.`);
    if (link.room) console.log(link.room.scores.map((x) => `${x.name} ${x.wins}/${x.games}`).join(', '));
  }
  console.log(position(link));
}

function readSeat(): SeatFile {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as SeatFile;
  } catch {
    return fail(`No seat in ${file}: run join or create first.`);
  }
}

async function claim(seat: SeatFile): Promise<Link> {
  const link = new Link(seat.host);
  await link.open();
  link.send({ t: 'join', room: seat.room, name: 'Player', token: seat.token });
  // The host answers with joined and room, then the game so far and, if it's your turn, yourTurn.
  await link.until((m) => m.t === 'room' || m.t === 'error', 10_000);
  await link.until(() => false, 300);
  return link;
}

/** Waits for your turn or the game's end, then prints. */
async function waitTurn(link: Link): Promise<void> {
  const ok = link.turn !== null || link.over !== null || (await link.until((m) => m.t === 'yourTurn' || (m.t === 'gameOver' && m.room.status === 'finished')));
  report(link, ok ? undefined : 'Still waiting: run wait again.');
  link.close();
  process.exit(ok ? 0 : 2);
}

const seatCommands: Record<string, () => Promise<void>> = {
  async create() {
    const host = opt('host') ?? 'ws://localhost:8787';
    const link = new Link(host);
    await link.open();
    link.send({ t: 'create', name: opt('name') ?? 'Agent', options: cleanOptions({ seats: Number(opt('seats') ?? 2), turnSeconds: Number(opt('turn') ?? 0), games: Number(opt('games') ?? 1), fill: opt('fill') ?? null }) });
    await joined(link, host);
  },
  async join() {
    const host = opt('host') ?? 'ws://localhost:8787';
    if (!rest[0]) fail('Usage: join ROOM --host URL --name NAME');
    const link = new Link(host);
    await link.open();
    link.send({ t: 'join', room: rest[0], name: opt('name') ?? 'Agent' });
    await joined(link, host);
  },
  async start() {
    const link = await claim(readSeat());
    link.send({ t: 'start' });
    await waitTurn(link);
  },
  async wait() {
    await waitTurn(await claim(readSeat()));
  },
  async show() {
    const link = await claim(readSeat());
    report(link);
    link.close();
  },
  async attack() {
    const link = await claim(readSeat());
    const [from, to] = rest.map(Number);
    if (!Number.isInteger(from) || !Number.isInteger(to)) fail('Usage: attack FROM TO');
    if (!link.turn) return waitTurn(link);
    link.send({ t: 'act', action: { type: 'attack', from: from!, to: to! }, i: link.turn.i });
    link.turn = null;
    await link.until((m) => m.t === 'yourTurn' || m.t === 'gameOver' || m.t === 'error', 10_000);
    await link.until(() => false, 200);
    report(link);
    link.close();
  },
  async end() {
    const link = await claim(readSeat());
    if (!link.turn) return waitTurn(link);
    link.send({ t: 'act', action: { type: 'endTurn' }, i: link.turn.i });
    link.turn = null;
    await waitTurn(link);
  },
  async turn() {
    const link = await claim(readSeat());
    const attacks = (rest[0] ?? '')
      .split(',')
      .filter(Boolean)
      .map((p) => p.split(':').map(Number) as [number, number]);
    if (attacks.some((a) => a.length !== 2 || !a.every(Number.isInteger))) fail('Usage: turn FROM:TO,FROM:TO');
    if (!link.turn) return waitTurn(link);
    link.send({ t: 'turn', attacks });
    link.turn = null;
    await waitTurn(link);
  },
  async leave() {
    const link = await claim(readSeat());
    link.send({ t: 'leave' });
    await link.until(() => false, 300);
    link.close();
    console.log('Left the room.');
  },
};

async function joined(link: Link, host: string): Promise<void> {
  let token = '';
  let room = '';
  await link.until((m) => {
    if (m.t === 'joined') {
      token = m.token;
      room = m.room;
    }
    return m.t === 'error' || (m.t === 'room' && token !== '');
  }, 10_000);
  if (!token) fail(link.lines.join('\n') || 'The host did not answer');
  writeFileSync(file, JSON.stringify({ host, room, token } satisfies SeatFile));
  console.log(`Seated in room ${room}. Seat saved in ${file}.`);
  report(link);
  link.close();
}

const run = seatCommands[command];
if (!run) fail(`Unknown command ${command}. Commands: ${Object.keys(seatCommands).join(', ')}`);
await run();
