// The online host: rooms over WebSocket for browsers and agents. `npm run host -- --port 8787`.
// All game logic lives in src/net/room.ts; this file only adapts it to sockets, timers and crypto.
import { randomInt, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { cleanOptions, parseClientMessage, type ClientMessage, type RoomInfo } from '../src/net/protocol';
import { Room, type RoomDeps, type Send } from '../src/net/room';

export interface HostOptions {
  /** 0 picks a free port. */
  port: number;
  /** Open rooms at once. */
  maxRooms?: number;
  /** Rooms one address may create per minute. */
  createsPerMinute?: number;
  /** An empty room is dropped after this long without activity. */
  idleMs?: number;
  quiet?: boolean;
}

export interface Host {
  port: number;
  rooms: ReadonlyMap<string, Room>;
  close(): Promise<void>;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A room hands the same message object to every client: encode it once. */
const wire = new WeakMap<object, string>();
const encode = (msg: object): string => {
  let s = wire.get(msg);
  if (s === undefined) wire.set(msg, (s = JSON.stringify(msg)));
  return s;
};
const LIST_LIMIT = 100;

const deps: RoomDeps = {
  seed: () => randomInt(0, 2 ** 32),
  token: () => randomUUID(),
  now: () => Date.now(),
  later: (fn) => setImmediate(fn),
};

export function startHost(opts: HostOptions): Promise<Host> {
  const maxRooms = opts.maxRooms ?? 200;
  const createsPerMinute = opts.createsPerMinute ?? 10;
  const idleMs = opts.idleMs ?? 10 * 60_000;
  const log = (line: string): void => {
    if (!opts.quiet) console.log(`[host] ${line}`);
  };
  const rooms = new Map<string, Room>();
  const creates = new Map<string, number[]>();

  const newCode = (): string => {
    for (;;) {
      const code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
      if (!rooms.has(code)) return code;
    }
  };

  const listing = (): RoomInfo[] => {
    const order = { lobby: 0, playing: 1, finished: 2 } as const;
    return [...rooms.values()]
      .map((r) => r.info())
      .sort((a, b) => order[a.status] - order[b.status])
      .slice(0, LIST_LIMIT);
  };

  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Hexdice host: connect over WebSocket. See docs/online.md.\n');
  });
  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress ?? '';
    let room: Room | null = null;
    const send: Send = (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(encode(msg));
    };
    const enter = (next: Room): void => {
      if (room && room !== next) room.leave(send);
      room = next;
    };

    const handle = (m: ClientMessage): void => {
      switch (m.t) {
        case 'rooms':
          return send({ t: 'rooms', rooms: listing() });
        case 'create': {
          const now = Date.now();
          const recent = (creates.get(ip) ?? []).filter((t) => now - t < 60_000);
          if (recent.length >= createsPerMinute) return send({ t: 'error', message: 'Too many new rooms from your address; try again in a minute' });
          if (rooms.size >= maxRooms) return send({ t: 'error', message: 'This host is full; try again later' });
          creates.set(ip, [...recent, now]);
          const r = new Room(newCode(), cleanOptions(m.options), deps);
          rooms.set(r.code, r);
          log(`room ${r.code} created (${r.options.seats} seats, ${r.options.games} games, ${rooms.size} open)`);
          enter(r);
          return r.join(m.name, send);
        }
        case 'join':
        case 'watch': {
          const r = rooms.get(m.room);
          if (!r) return send({ t: 'error', message: `No room ${m.room} on this host` });
          enter(r);
          if (m.t === 'watch') return r.watch(send);
          return m.token ? r.rejoin(m.token, send) : r.join(m.name, send);
        }
        default: {
          if (!room) return send({ t: 'error', message: 'Join a room first' });
          if (m.t === 'start') return room.start(send);
          if (m.t === 'act') return room.act(send, m.action, m.i);
          if (m.t === 'turn') return room.turn(send, m.attacks);
          room.leave(send);
          room = null;
        }
      }
    };

    ws.on('message', (data, isBinary) => {
      const m = isBinary ? null : parseClientMessage(data.toString());
      if (!m) return send({ t: 'error', message: 'Unreadable message; see docs/online.md' });
      try {
        handle(m);
      } catch (e) {
        console.error('[host] failed on a message:', e);
        send({ t: 'error', message: 'The host failed on that message' });
      }
    });
    ws.on('close', () => room?.disconnect(send));
  });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [code, r] of rooms) {
      try {
        r.tick(now);
      } catch (e) {
        console.error(`[host] room ${code} failed on a tick:`, e);
      }
      if (r.idle(now, idleMs)) {
        rooms.delete(code);
        log(`room ${code} closed (idle)`);
      }
    }
  }, 250);
  timer.unref();

  return new Promise((resolve) => {
    server.listen(opts.port, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : opts.port;
      resolve({
        port,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(timer);
            for (const c of wss.clients) c.terminate();
            wss.close(() => server.close(() => done()));
          }),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--port');
  const port = Number(i >= 0 ? process.argv[i + 1] : (process.env.PORT ?? 8787));
  void startHost({ port }).then((h) => console.log(`Hexdice host on ws://localhost:${h.port}`));
}
