// Online play in the browser: the connection to a host, the Play online and lobby screens, and handing the game to the
// controller. The host decides everything; this only relays.
import type { Action, GameConfig, GameEvent, GameState, PlayerId } from '../engine/types';
import { Connection } from '../net/client';
import type { ClientMessage, RoomInfo, ServerMessage, Snapshot } from '../net/protocol';
import { showLobby, showOnlineSetup, type HostEntry, type LobbyView, type SetupView } from '../ui/online';

const KEY = 'hexdice:online';
const RETRY_MS = 2000;

/** What the controller needs from the room while a game is on. */
export interface OnlineLink {
  /** Your player in the game; null when watching. */
  you: PlayerId | null;
  act(action: Action, i: number): void;
  leave(): void;
  /** Once the game is over, for the room's owner: start another with the same seats. */
  rematch(): (() => void) | null;
  /** The player in that seat has lost their connection for a while. */
  away(identity: number): boolean;
  /** "game 3 of 100" in a series; null otherwise. */
  note(): string | null;
  /** The series score so far; null outside a series. */
  scores(): string | null;
}

/** The controller, as the online flow sees it. */
export interface OnlineView {
  startOnline(state: GameState, link: OnlineLink): void;
  onlineResult(action: Action, events: GameEvent[], snap: Snapshot): void;
  onlineTurn(i: number): void;
  onlineGameOver(config: GameConfig, actions: readonly Action[]): void;
  onlineMessage(text: string): void;
  onlineRoom(): void;
  leaveOnline(): void;
}

/** The public hosts listed in hosts.json next to the game. */
export async function loadHosts(): Promise<HostEntry[]> {
  try {
    const res = await fetch('./hosts.json');
    if (!res.ok) return [];
    const list: unknown = await res.json();
    if (!Array.isArray(list)) return [];
    return list.filter((h: Partial<HostEntry> | null): h is HostEntry => typeof h?.name === 'string' && typeof h.url === 'string' && /^wss?:\/\//.test(h.url));
  } catch {
    return [];
  }
}

function remembered(): { name?: string; host?: string } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { name?: unknown; host?: unknown } | null;
    return { name: typeof raw?.name === 'string' ? raw.name : undefined, host: typeof raw?.host === 'string' ? raw.host : undefined };
  } catch {
    return {};
  }
}

function remember(name: string, host: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name, host }));
  } catch {
    // Ignore: remembering your name is a convenience.
  }
}

export class OnlineFlow {
  private conn: Connection | null = null;
  private url = '';
  private seat: { room: string; token: string; seat: number } | null = null;
  private watched: string | null = null;
  private info: RoomInfo | null = null;
  /** A game screen is up: messages go to the controller. */
  private playing = false;
  private setup: SetupView | null = null;
  private lobby: LobbyView | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly view: OnlineView,
  ) {}

  open(hosts: HostEntry[], host: string | null, room: string | null): void {
    this.leave();
    const saved = remembered();
    const url = host ?? saved.host ?? hosts[0]?.url ?? 'ws://localhost:8787';
    this.setup = showOnlineSetup(this.root, { hosts, host: url, name: saved.name ?? '', room: room ?? '' }, {
      onCreate: ({ host: h, name, options }) => void this.go(h, { t: 'create', name, options }, name),
      onJoin: ({ host: h, name, code }) => void this.go(h, { t: 'join', room: code, name }, name),
      onWatch: ({ host: h, code }) => void this.go(h, { t: 'watch', room: code }),
      onRefresh: (h) => void this.go(h, { t: 'rooms' }),
      onBack: () => this.quit(),
    });
    void this.go(url, { t: 'rooms' });
  }

  /** Leaves the room and closes the connection; the caller decides which screen comes next. */
  leave(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.seat || this.watched) this.conn?.send({ t: 'leave' });
    this.drop();
    this.seat = null;
    this.watched = null;
    this.info = null;
    this.playing = false;
    this.lobby = null;
    this.setup = null;
  }

  private quit(): void {
    this.leave();
    this.view.leaveOnline();
  }

  private async go(host: string, msg: ClientMessage, name?: string): Promise<void> {
    if (name) remember(name, host);
    if (msg.t === 'watch') this.watched = msg.room;
    try {
      await this.connect(host);
    } catch {
      this.status(`Could not reach ${host}. Is the host running?`);
      return;
    }
    this.conn?.send(msg);
  }

  private connect(host: string): Promise<void> {
    if (this.conn && this.url === host) return this.conn.opened;
    this.drop();
    this.url = host;
    const conn = new Connection(
      host,
      (m) => {
        if (this.conn === conn) this.onMessage(m);
      },
      () => {
        if (this.conn === conn) this.onClose();
      },
    );
    this.conn = conn;
    return conn.opened;
  }

  /** Closes the connection without trying to get it back. */
  private drop(): void {
    const c = this.conn;
    this.conn = null;
    c?.close();
  }

  private onClose(): void {
    this.conn = null;
    if (!this.seat && !this.watched) return;
    this.status('Lost the connection to the host. Trying again…');
    this.retry = setTimeout(() => void this.reconnect(), RETRY_MS);
  }

  /** Takes the seat back (or keeps watching); the host answers with the game as it stands. */
  private async reconnect(): Promise<void> {
    this.retry = null;
    try {
      await this.connect(this.url);
    } catch {
      return; // The failed connection's close event schedules the next try.
    }
    if (this.seat) this.conn?.send({ t: 'join', room: this.seat.room, name: 'Player', token: this.seat.token });
    else if (this.watched) this.conn?.send({ t: 'watch', room: this.watched });
  }

  private status(text: string): void {
    if (this.playing) this.view.onlineMessage(text);
    else (this.lobby ?? this.setup)?.status(text);
  }

  private onMessage(m: ServerMessage): void {
    switch (m.t) {
      case 'rooms':
        return this.setup?.setRooms(m.rooms);
      case 'joined':
        this.seat = { room: m.room, token: m.token, seat: m.seat };
        this.watched = null;
        return;
      case 'room':
        this.info = m.room;
        if (this.playing) return this.view.onlineRoom();
        return this.showLobby(m.room);
      case 'started':
        this.playing = true;
        this.lobby = null;
        this.setup = null;
        return this.view.startOnline(m.state, this.link(m.you));
      case 'result':
        return this.view.onlineResult(m.action, m.events, m.state);
      case 'yourTurn':
        return this.view.onlineTurn(m.i);
      case 'gameOver':
        this.info = m.room;
        return this.view.onlineGameOver(m.config, m.actions);
      case 'error':
        // Refused before getting into a room (no such room, full, started): nothing to come back to.
        if (!this.info) this.watched = null;
        return this.status(m.message);
    }
  }

  private showLobby(info: RoomInfo): void {
    if (!this.lobby) {
      const link = `${location.origin}${location.pathname}?host=${encodeURIComponent(this.url)}&room=${info.code}`;
      this.lobby = showLobby(this.root, { link, onStart: () => this.conn?.send({ t: 'start' }), onLeave: () => this.quit() });
      this.setup = null;
    }
    this.lobby.update(info, this.seat?.seat ?? null);
  }

  private link(you: PlayerId | null): OnlineLink {
    return {
      you,
      act: (action, i) => this.conn?.send({ t: 'act', action, i }),
      leave: () => this.leave(),
      rematch: () => {
        const info = this.info;
        return this.seat && info && info.owner === this.seat.seat && info.status === 'finished' ? () => this.conn?.send({ t: 'start' }) : null;
      },
      away: (identity) => this.info?.seats[identity]?.connected === false,
      note: () => {
        const info = this.info;
        return info && info.options.games > 1 ? `game ${info.game} of ${info.options.games}` : null;
      },
      scores: () => {
        const info = this.info;
        if (!info || info.options.games <= 1) return null;
        const played = Math.max(0, ...info.scores.map((s) => s.games));
        return `After ${played} of ${info.options.games}: ${info.scores.map((s) => `${s.name} ${s.wins}`).join(' · ')}`;
      },
    };
  }
}
