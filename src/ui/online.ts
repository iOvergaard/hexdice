// The Play online screen (create, join or watch a room) and the lobby. Plain DOM; src/game/online.ts drives them.
import type { AiLevel } from '../engine/types';
import { MAX_SEATS, MIN_SEATS, type RoomInfo, type RoomOptions } from '../net/protocol';
import { emblemPath, playerColour } from './identity';
import { el } from './panel';

export interface HostEntry {
  name: string;
  url: string;
}

function button(label: string, testid: string, cls = 'btn'): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.dataset.testid = testid;
  return b;
}

function field(label: string, input: HTMLInputElement): HTMLLabelElement {
  const l = el('label', 'field');
  l.append(el('span', 'field-label', label), input);
  return l;
}

function input(testid: string, value: string, placeholder = ''): HTMLInputElement {
  const i = el('input', 'text-input');
  i.type = 'text';
  i.value = value;
  i.placeholder = placeholder;
  i.dataset.testid = testid;
  i.autocomplete = 'off';
  i.spellcheck = false;
  return i;
}

/** A row of chips with one pressed; returns the row and a getter for the choice. */
function chips<T>(label: string, id: string, options: ReadonlyArray<readonly [T, string, string]>, initial: T): [HTMLElement, () => T] {
  let value = initial;
  const wrap = el('section', 'choice');
  wrap.setAttribute('aria-labelledby', id);
  const h = el('h3', 'choice-label', label);
  h.id = id;
  const row = el('div', 'choice-row');
  const all: Array<[T, HTMLButtonElement]> = options.map(([v, text, testid]) => {
    const b = button(text, testid, 'chip-btn');
    b.addEventListener('click', () => {
      value = v;
      sync();
    });
    row.append(b);
    return [v, b];
  });
  const sync = (): void => all.forEach(([v, b]) => b.setAttribute('aria-pressed', String(v === value)));
  sync();
  wrap.append(h, row);
  return [wrap, () => value];
}

function emblem(identity: number): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '-12 -12 24 24');
  s.setAttribute('class', 'emblem');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', emblemPath(identity, 10));
  s.append(p);
  return s;
}

const STATUS: Record<RoomInfo['status'], string> = { lobby: 'waiting', playing: 'playing', finished: 'finished' };

export interface SetupHandlers {
  onCreate(o: { host: string; name: string; options: RoomOptions }): void;
  onJoin(o: { host: string; name: string; code: string }): void;
  onWatch(o: { host: string; code: string }): void;
  onRefresh(host: string): void;
  onBack(): void;
}

export interface SetupView {
  setRooms(rooms: RoomInfo[]): void;
  status(text: string): void;
}

export function showOnlineSetup(root: HTMLElement, initial: { hosts: HostEntry[]; host: string; name: string; room: string }, h: SetupHandlers): SetupView {
  const screen = el('main', 'online');
  screen.dataset.testid = 'online';
  const head = el('div', 'online-head');
  const back = button('Back', 'online-back', 'btn btn-quiet');
  back.addEventListener('click', h.onBack);
  head.append(el('h1', 'online-title', 'Play online'), back);

  const name = input('online-name', initial.name, 'Your name');
  name.maxLength = 20;
  const host = input('online-host', initial.host, 'wss://…');
  if (initial.hosts.length) {
    const list = el('datalist');
    list.id = 'online-hosts';
    for (const x of initial.hosts) list.append(new Option(x.name, x.url));
    host.setAttribute('list', list.id);
    screen.append(list);
  }
  const status = el('p', 'online-status');
  status.dataset.testid = 'online-status';
  status.setAttribute('role', 'status');
  const say = (text: string): void => {
    status.textContent = text;
  };
  const who = (): string | null => {
    const n = name.value.trim();
    if (!n) {
      say('Type your name first.');
      name.focus();
      return null;
    }
    return n;
  };
  const url = (): string => host.value.trim();

  // New room
  const create = el('section', 'online-card');
  create.append(el('h2', undefined, 'New room'));
  const seatOptions = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => [i + MIN_SEATS, String(i + MIN_SEATS), `online-seats-${i + MIN_SEATS}`] as const);
  const [seatsWrap, seats] = chips('Seats', 'online-seats', seatOptions, 2);
  const fillOptions = [
    [null, 'None', 'online-fill-none'],
    ['easy', 'Easy', 'online-fill-easy'],
    ['normal', 'Normal', 'online-fill-normal'],
    ['hard', 'Hard', 'online-fill-hard'],
  ] as const;
  const [fillWrap, fill] = chips<AiLevel | null>('Computer players in empty seats', 'online-fill', fillOptions, null);
  const turnOptions = [
    [30, '30 s', 'online-turn-30'],
    [60, '1 min', 'online-turn-60'],
    [120, '2 min', 'online-turn-120'],
    [0, 'No limit', 'online-turn-0'],
  ] as const;
  const [turnWrap, turn] = chips('Time per turn', 'online-turn', turnOptions, 60);
  const createButton = button('Create room', 'online-create', 'btn btn-primary');
  createButton.addEventListener('click', () => {
    const n = who();
    if (n) h.onCreate({ host: url(), name: n, options: { seats: seats(), fill: fill(), turnSeconds: turn(), games: 1 } });
  });
  create.append(seatsWrap, fillWrap, turnWrap, createButton);

  // Join by code
  const join = el('section', 'online-card');
  const code = input('online-code', initial.room, 'Room code');
  code.maxLength = 8;
  code.setAttribute('aria-label', 'Room code');
  code.classList.add('code-input');
  const joinButton = button('Join', 'online-join', 'btn btn-primary');
  joinButton.addEventListener('click', () => {
    const n = who();
    const c = code.value.trim().toUpperCase();
    if (!c) return say('Type the room code first.');
    if (n) h.onJoin({ host: url(), name: n, code: c });
  });
  const joinRow = el('div', 'online-row');
  joinRow.append(code, joinButton);
  join.append(el('h2', undefined, 'Join a room'), joinRow);

  // Rooms on this host
  const rooms = el('section', 'online-card');
  const roomsHead = el('div', 'online-head');
  const refresh = button('Refresh', 'online-refresh', 'btn btn-quiet');
  refresh.addEventListener('click', () => h.onRefresh(url()));
  roomsHead.append(el('h2', undefined, 'Rooms on this host'), refresh);
  const list = el('ul', 'room-list');
  list.dataset.testid = 'online-rooms';
  rooms.append(roomsHead, list);

  screen.append(head, field('Your name', name), field('Host', host), status, ...(initial.room ? [join, create] : [create, join]), rooms);
  root.replaceChildren(screen);
  (initial.room && !initial.name ? name : initial.room ? joinButton : name).focus({ preventScroll: true });

  return {
    status: say,
    setRooms(all) {
      list.replaceChildren();
      if (all.length === 0) list.append(el('li', 'room-empty', 'No rooms yet. Make one above.'));
      for (const r of all) {
        const li = el('li', 'room');
        li.dataset.testid = `online-room-${r.code}`;
        const names = r.seats.map((s) => s.name).join(', ') || 'nobody yet';
        const series = r.options.games > 1 ? ` · game ${r.game} of ${r.options.games}` : '';
        li.append(el('span', 'room-text', `${r.code} · ${STATUS[r.status]} · ${r.seats.length}/${r.options.seats} · ${names}${series}`));
        if (r.status === 'lobby' && r.seats.length < r.options.seats) {
          const b = button('Join', `online-room-join-${r.code}`, 'btn');
          b.addEventListener('click', () => {
            const n = who();
            if (n) h.onJoin({ host: url(), name: n, code: r.code });
          });
          li.append(b);
        }
        const w = button('Watch', `online-room-watch-${r.code}`, 'btn btn-quiet');
        w.addEventListener('click', () => h.onWatch({ host: url(), code: r.code }));
        li.append(w);
        list.append(li);
      }
    },
  };
}

export interface LobbyView {
  update(info: RoomInfo, you: number | null): void;
  status(text: string): void;
}

export function showLobby(root: HTMLElement, h: { link: string; onStart: () => void; onLeave: () => void }): LobbyView {
  const screen = el('main', 'online');
  screen.dataset.testid = 'lobby';
  const title = el('h1', 'online-title');
  const code = el('span', 'lobby-code');
  code.dataset.testid = 'lobby-code';
  title.append('Room ', code);

  const share = el('section', 'online-card');
  const link = input('lobby-link', h.link);
  link.readOnly = true;
  link.setAttribute('aria-label', 'Link to this room');
  link.addEventListener('focus', () => link.select());
  const copy = button('Copy link', 'lobby-copy', 'btn');
  const copied = el('p', 'online-status');
  copied.setAttribute('role', 'status');
  copy.addEventListener('click', () => {
    link.select();
    void navigator.clipboard?.writeText(h.link).then(
      () => (copied.textContent = 'Copied.'),
      () => (copied.textContent = 'Select the link and copy it.'),
    );
  });
  const row = el('div', 'online-row');
  row.append(link, copy);
  share.append(el('p', 'online-hint', 'Send this link, or the room code, to whoever you want to play. Agents join with the code.'), row, copied);

  const seats = el('ul', 'seat-list');
  seats.dataset.testid = 'lobby-seats';
  const status = el('p', 'online-status');
  status.dataset.testid = 'lobby-status';
  status.setAttribute('role', 'status');
  const start = button('Start', 'lobby-start', 'btn btn-primary btn-big');
  start.addEventListener('click', h.onStart);
  const leave = button('Leave', 'lobby-leave', 'btn');
  leave.addEventListener('click', h.onLeave);
  const actions = el('div', 'online-row');
  actions.append(start, leave);

  screen.append(title, share, seats, status, actions);
  root.replaceChildren(screen);

  return {
    status(text) {
      status.textContent = text;
    },
    update(info, you) {
      code.textContent = info.code;
      const filled = info.seats.map((s) => {
        const li = el('li', 'seat');
        li.style.setProperty('--c', playerColour(s.seat));
        const tags = [s.seat === you ? 'you' : '', s.kind === 'computer' ? 'computer' : '', !s.connected ? 'away' : '', s.seat === info.owner ? 'starts the game' : ''].filter(Boolean);
        li.append(emblem(s.seat), el('span', 'seat-name', s.name), el('span', 'seat-tag', tags.join(' · ')));
        return li;
      });
      const empty = Array.from({ length: Math.max(0, info.options.seats - info.seats.length) }, (_, i) => {
        const li = el('li', 'seat seat-open');
        li.style.setProperty('--c', playerColour(info.seats.length + i));
        li.append(emblem(info.seats.length + i), el('span', 'seat-name', info.options.fill ? `Computer (${info.options.fill}) unless someone joins` : 'Open seat'));
        return li;
      });
      seats.replaceChildren(...filled, ...empty);
      const owner = info.owner === null ? null : info.seats[info.owner];
      const mine = you !== null && you === info.owner;
      const players = info.seats.length + (info.options.fill ? info.options.seats - info.seats.length : 0);
      start.hidden = !mine;
      start.disabled = players < 2;
      if (info.status === 'finished') status.textContent = 'This room has finished its games.';
      else if (mine) status.textContent = players < 2 ? 'Waiting for someone to join.' : 'Start when everyone is in.';
      else if (you === null) status.textContent = 'Watching. The game shows here when it starts.';
      else status.textContent = `Waiting for ${owner?.name ?? 'the room'} to start.`;
    },
  };
}
