import type { AiLevel, GameState } from '../engine/types';
import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/config';
import { BoardView } from './board-view';
import { Hud } from './hud';
import { PALETTE, emblemPath, playerColour } from './identity';
import { RollView } from './roll-view';
import { soundToggle } from './sound-toggle';
import { renderEnding, type Ending } from './ending';
import { PICTURE_LABEL, pictureBlob, pictureDate, pictureWay, sendPicture } from './share-picture';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, testid: string, cls = 'btn'): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.dataset.testid = testid;
  return b;
}

export interface TitleOptions {
  players: number;
  aiLevel: AiLevel;
}

/** The eight emblems in their colours, as a small mark under the name. */
function emblemRow(): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '0 0 320 40');
  s.setAttribute('class', 'title-mark');
  s.setAttribute('aria-hidden', 'true');
  PALETTE.forEach((colour, i) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${20 + i * 40} 20)`);
    const plate = document.createElementNS(SVG_NS, 'rect');
    plate.setAttribute('x', '-16');
    plate.setAttribute('y', '-16');
    plate.setAttribute('width', '32');
    plate.setAttribute('height', '32');
    plate.setAttribute('rx', '9');
    plate.setAttribute('fill', colour);
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', emblemPath(i, 9));
    p.setAttribute('fill', '#12162a');
    g.append(plate, p);
    s.append(g);
  });
  return s;
}

/** The title's sound toggle: toggle() flips the setting and returns the new state. */
export interface TitleSound {
  on: boolean;
  toggle: () => boolean;
}

export function showTitle(
  root: HTMLElement,
  initial: TitleOptions,
  onStart: (opts: TitleOptions) => void,
  sound?: TitleSound,
  onContinue?: () => void,
  onHelp?: () => void,
  whatsNew?: { unseen: boolean; open: () => void },
  scene?: () => GameState,
  /** A game link opened while a game is in progress: offered beside Continue instead of replacing it unasked. */
  onLink?: () => void,
): void {
  let players = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, initial.players));
  let aiLevel = initial.aiLevel;

  const screen = el('main', 'title');
  screen.dataset.testid = 'title';
  const head = el('div', 'title-head');
  head.append(el('h1', 'title-name', 'Hexdice'), emblemRow());
  const form = el('div', 'title-form');
  form.append(el('p', 'title-tagline', 'Roll your dice, take the map.'));

  const chipGroup = (label: string, id: string): [HTMLElement, HTMLElement] => {
    const wrap = el('section', 'choice');
    wrap.setAttribute('aria-labelledby', id);
    const h = el('h2', 'choice-label', label);
    h.id = id;
    const row = el('div', 'choice-row');
    wrap.append(h, row);
    return [wrap, row];
  };

  // Counted as opponents: "players" read as a hot-seat count to new players.
  const [playersWrap, playersRow] = chipGroup('Computer opponents', 'title-players');
  const playerButtons: HTMLButtonElement[] = [];
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const b = button(String(n - 1), `opponents-${n - 1}`, 'chip-btn');
    b.addEventListener('click', () => {
      players = n;
      sync();
    });
    playerButtons.push(b);
    playersRow.append(b);
  }

  const [aiWrap, aiRow] = chipGroup('AI level', 'title-ai');
  const aiButtons = new Map<AiLevel, HTMLButtonElement>();
  for (const [level, label] of [['easy', 'Easy'], ['normal', 'Normal']] as const) {
    const b = button(label, `ai-${level}`, 'chip-btn');
    b.addEventListener('click', () => {
      aiLevel = level;
      sync();
    });
    aiButtons.set(level, b);
    aiRow.append(b);
  }

  const start = button('Start', 'start', 'btn btn-primary btn-big');
  start.addEventListener('click', () => onStart({ players, aiLevel }));

  function sync(): void {
    playerButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(MIN_PLAYERS + i === players)));
    for (const [level, b] of aiButtons) b.setAttribute('aria-pressed', String(level === aiLevel));
  }
  sync();

  const actions = el('div', 'title-actions');
  if (onContinue) {
    const cont = button('Continue game', 'continue', 'btn btn-primary btn-big');
    cont.addEventListener('click', onContinue);
    actions.append(cont);
    start.className = 'btn btn-big';
  }
  if (onLink) {
    const link = button('Play linked game', 'play-link', 'btn btn-big');
    link.addEventListener('click', onLink);
    actions.append(link);
  }
  actions.append(start);
  const extras = el('div', 'title-extras');
  if (onHelp) {
    const help = button('How to play', 'how-to-play', 'btn btn-quiet');
    help.addEventListener('click', onHelp);
    extras.append(help);
  }
  if (whatsNew) {
    const news = button("What's new", 'whats-new', 'btn btn-quiet whats-new-button');
    if (whatsNew.unseen) {
      news.append(el('span', 'whats-new-dot'));
      news.setAttribute('aria-label', "What's new (updated)");
    }
    news.addEventListener('click', () => {
      news.querySelector('.whats-new-dot')?.remove();
      news.removeAttribute('aria-label');
      whatsNew.open();
    });
    extras.append(news);
  }
  if (sound) {
    const toggle = soundToggle();
    toggle.set(sound.on);
    toggle.el.addEventListener('click', () => toggle.set(sound.toggle()));
    extras.append(toggle.el);
  }

  form.append(playersWrap, aiWrap, actions);
  if (extras.childElementCount > 0) form.append(extras);
  if (scene) screen.append(titleScene(scene));
  screen.append(head, form);
  root.replaceChildren(screen);
}

/** A dealt board behind the menu, built a frame later so the menu paints first. */
function titleScene(scene: () => GameState): HTMLElement {
  const hero = el('div', 'title-hero');
  hero.dataset.testid = 'title-scene';
  const frame = el('div', 'title-hero-frame');
  hero.append(frame);
  // Two frames: a single rAF callback runs before its frame paints.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!hero.isConnected) return;
      new BoardView(frame, true).render(scene(), { selected: null, targets: [], attack: null, interactive: false });
    }),
  );
  return hero;
}

export class PreviewPrompt {
  private readonly el: HTMLElement;
  private readonly seed: HTMLElement;
  private readonly you: HTMLElement;
  private readonly yes: HTMLButtonElement;
  private readonly no: HTMLButtonElement;

  constructor(
    container: HTMLElement,
    private readonly hudContainer: HTMLElement,
  ) {
    this.el = el('div', 'preview');
    this.el.dataset.testid = 'preview';
    // The prompt and the player bar share one cell of the bar slot and both keep their place, so the board's box is
    // the same before and after Yes. The one not in use is inert, which ui.css also hides. The attribute rather than
    // the property, so the CSS hides it even in a browser without inert.
    this.el.toggleAttribute('inert', true);
    const text = el('div', 'preview-text');
    const head = el('div', 'preview-head');
    head.append(el('p', 'preview-question', 'Play on this map?'));
    this.you = el('span', 'preview-you');
    this.you.dataset.testid = 'preview-you';
    this.you.hidden = true;
    head.append(this.you);
    text.append(head);
    this.seed = el('p', 'preview-seed');
    this.seed.dataset.testid = 'preview-seed';
    text.append(this.seed);
    const actions = el('div', 'preview-actions');
    this.yes = button('Yes', 'preview-yes', 'btn btn-primary');
    this.no = button('No', 'preview-no', 'btn');
    actions.append(this.no, this.yes);
    this.el.append(text, actions);
    container.append(this.el);
  }

  show(seed: number, handlers: { onYes: () => void; onNo: () => void }, you?: { name: string; identity: number }): void {
    this.you.hidden = !you;
    if (you) {
      const chip = el('span', 'preview-you-chip');
      chip.style.setProperty('--c', playerColour(you.identity));
      const badge = el('span', 'chip-badge');
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('viewBox', '-12 -12 24 24');
      s.setAttribute('class', 'emblem');
      s.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', emblemPath(you.identity, 10));
      s.append(path);
      badge.append(s);
      chip.append(badge);
      this.you.replaceChildren(el('span', 'preview-you-label', 'You are'), chip);
      this.you.setAttribute('aria-label', `You are ${you.name}`);
    }
    this.seed.textContent = `Seed ${seed}`;
    this.yes.onclick = handlers.onYes;
    this.no.onclick = handlers.onNo;
    this.hudContainer.toggleAttribute('inert', true);
    this.el.toggleAttribute('inert', false);
  }

  hide(): void {
    this.el.toggleAttribute('inert', true);
    this.hudContainer.toggleAttribute('inert', false);
  }
}

/** Copies the game to the clipboard; where the browser won't, shows it in a field with the text selected. */
function copyGame(text: string, status: HTMLElement): void {
  const fallback = (): void => {
    status.textContent = 'Select the text below and copy it.';
    const field = el('textarea', 'overlay-copy-text');
    field.dataset.testid = 'overlay-copy-text';
    field.readOnly = true;
    field.rows = 3;
    field.value = text;
    field.setAttribute('aria-label', 'Game record');
    status.after(field);
    field.focus({ preventScroll: true });
    field.setSelectionRange(0, text.length);
  };
  status.parentElement?.querySelector('.overlay-copy-text')?.remove();
  status.hidden = false;
  if (!navigator.clipboard?.writeText) return fallback();
  navigator.clipboard.writeText(text).then(
    () => {
      status.textContent = 'Copied. Paste it anywhere to keep or share the game.';
    },
    fallback,
  );
}

/** Over the board: who won, how the map changed hands, then Replay (or Watch the rest), Title and Copy game. */
export class GameOverOverlay {
  private readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly actions: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = el('div', 'overlay');
    this.el.dataset.testid = 'overlay';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-labelledby', 'overlay-heading');
    this.body = el('div', 'overlay-body');
    this.actions = el('div', 'overlay-actions');
    this.el.append(this.body);
    container.append(this.el);
  }

  /** `onCopy` returns the game record to copy; null leaves the button out. `seed` goes on the picture, so others can play the same map. */
  show(
    ending: Ending,
    actions: { onTitle: () => void; onReplay: (() => void) | null; onWatch: (() => void) | null; onCopy?: (() => string) | null; seed?: number },
  ): void {
    this.el.className = `overlay mood-${ending.mood}`;
    const card = renderEnding(ending);
    const buttons: HTMLButtonElement[] = [];
    if (actions.onWatch) {
      const b = button('Watch the rest', 'overlay-watch', 'btn btn-primary');
      b.addEventListener('click', actions.onWatch);
      buttons.push(b);
    }
    if (actions.onReplay) {
      const b = button('Replay', 'overlay-replay', actions.onWatch ? 'btn' : 'btn btn-primary');
      b.addEventListener('click', actions.onReplay);
      buttons.push(b);
    }
    const t = button('Title', 'overlay-title', 'btn');
    t.addEventListener('click', actions.onTitle);
    buttons.push(t);
    this.actions.replaceChildren(...buttons);
    const status = el('p', 'overlay-copy-status');
    status.dataset.testid = 'overlay-copy-status';
    status.setAttribute('role', 'status');
    status.hidden = true;
    // Drawn now rather than on the press, so the share sheet opens while the press still counts as one.
    const today = pictureDate(new Date());
    const footer = actions.seed === undefined ? today : `Seed ${actions.seed} · ${today}`;
    let blob: Promise<Blob> | null = null;
    try {
      blob = pictureBlob(ending, footer);
      blob.catch(() => {});
    } catch {
      blob = null;
    }
    if (blob) {
      const picture = blob;
      const way = pictureWay();
      const b = button(PICTURE_LABEL[way], 'overlay-picture', 'btn btn-quiet');
      b.dataset.way = way;
      b.addEventListener('click', () => {
        status.parentElement?.querySelector('.overlay-copy-text')?.remove();
        void sendPicture(way, picture, `hexdice-${today}.png`).then((line) => {
          status.hidden = line === null;
          if (line !== null) status.textContent = line;
        });
      });
      this.actions.append(b);
    }
    const onCopy = actions.onCopy;
    if (onCopy) {
      const b = button('Copy game', 'overlay-copy', 'btn btn-quiet');
      b.addEventListener('click', () => copyGame(onCopy(), status));
      this.actions.append(b);
    }
    this.actions.append(status);
    card.append(this.actions);
    this.body.replaceChildren(card);
    this.el.hidden = false;
    buttons[0]?.focus({ preventScroll: true });
  }

  hide(): void {
    this.el.hidden = true;
    this.actions.replaceChildren();
    this.body.replaceChildren();
  }
}

/** The "big bang" banner when a player is knocked out: slams in over the board, then clears itself. */
export class EliminationBanner {
  private readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement) {
    this.el = el('div', 'elimination');
    this.el.dataset.testid = 'elimination-banner';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'assertive');
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '-12 -12 24 24');
    s.setAttribute('class', 'emblem elimination-emblem');
    s.setAttribute('aria-hidden', 'true');
    s.append(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    this.title = el('p', 'elimination-title');
    this.detail = el('p', 'elimination-detail');
    this.el.append(s, this.title, this.detail);
    container.append(this.el);
  }

  /** `at` is the banner's vertical centre as a fraction of the board, so it can stay clear of the blast. */
  show(title: string, detail: string, identity: number, durationMs: number, at = 0.5): Promise<void> {
    this.hide();
    if (durationMs <= 0) return Promise.resolve();
    this.el.style.setProperty('--at', `${Math.round(at * 100)}%`);
    this.el.style.setProperty('--c', playerColour(identity));
    this.el.style.setProperty('--dur', `${durationMs}ms`);
    this.el.querySelector('path')!.setAttribute('d', emblemPath(identity, 10));
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.el.hidden = false;
    return new Promise((resolve) => {
      this.timer = setTimeout(() => {
        this.hide();
        resolve();
      }, durationMs);
    });
  }

  hide(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.el.hidden = true;
  }
}

export interface GameScreen {
  board: BoardView;
  roll: RollView;
  hud: Hud;
  preview: PreviewPrompt;
  overlay: GameOverOverlay;
  banner: EliminationBanner;
}

/** Layout, top to bottom: roll strip, board, player bar and controls. */
export function createGameScreen(root: HTMLElement): GameScreen {
  const screen = el('main', 'game');
  screen.dataset.testid = 'game';
  const rollSlot = el('div', 'roll-slot');
  const boardWrap = el('div', 'board-wrap');
  const barSlot = el('div', 'bar-slot');
  const hudContainer = el('div', 'hud');
  screen.append(rollSlot, boardWrap, barSlot);
  barSlot.append(hudContainer);
  root.replaceChildren(screen);

  return {
    roll: new RollView(rollSlot),
    board: new BoardView(boardWrap),
    overlay: new GameOverOverlay(boardWrap),
    banner: new EliminationBanner(boardWrap),
    hud: new Hud(hudContainer),
    preview: new PreviewPrompt(barSlot, hudContainer),
  };
}
