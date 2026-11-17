import type { AiLevel } from '../engine/types';
import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/config';
import { BoardView } from './board-view';
import { Hud } from './hud';
import { PALETTE, emblemPath, playerColour } from './identity';
import { RollView } from './roll-view';
import { soundToggle } from './sound-toggle';

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

export function showTitle(root: HTMLElement, initial: TitleOptions, onStart: (opts: TitleOptions) => void, sound?: TitleSound, onContinue?: () => void): void {
  let players = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, initial.players));
  let aiLevel = initial.aiLevel;

  const screen = el('main', 'title');
  screen.dataset.testid = 'title';
  screen.append(el('h1', 'title-name', 'Hexdice'), emblemRow(), el('p', 'title-tagline', 'Roll your dice, take the map.'));

  const chipGroup = (label: string, id: string): [HTMLElement, HTMLElement] => {
    const wrap = el('section', 'choice');
    wrap.setAttribute('aria-labelledby', id);
    const h = el('h2', 'choice-label', label);
    h.id = id;
    const row = el('div', 'choice-row');
    wrap.append(h, row);
    return [wrap, row];
  };

  const [playersWrap, playersRow] = chipGroup('Players, including you', 'title-players');
  const playerButtons: HTMLButtonElement[] = [];
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    const b = button(`${n} players`, `players-${n}`, 'chip-btn');
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
  actions.append(start);
  if (sound) {
    const toggle = soundToggle();
    toggle.set(sound.on);
    toggle.el.addEventListener('click', () => toggle.set(sound.toggle()));
    actions.append(toggle.el);
  }

  screen.append(playersWrap, aiWrap, actions);
  root.replaceChildren(screen);
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
    this.el.hidden = true;
    const text = el('div', 'preview-text');
    const head = el('div', 'preview-head');
    head.append(el('p', 'preview-question', 'Play this board?'));
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
    this.hudContainer.hidden = true;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
    this.hudContainer.hidden = false;
  }
}

export class GameOverOverlay {
  private readonly el: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly actions: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = el('div', 'overlay');
    this.el.dataset.testid = 'overlay';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.heading = el('h2', 'overlay-heading');
    this.heading.dataset.testid = 'overlay-heading';
    this.heading.id = 'overlay-heading';
    this.el.setAttribute('aria-labelledby', 'overlay-heading');
    this.actions = el('div', 'overlay-actions');
    this.el.append(this.heading, this.actions);
    container.append(this.el);
  }

  show(title: string, actions: { onTitle: () => void; onReplay: (() => void) | null; onWatch: (() => void) | null }): void {
    this.heading.textContent = title;
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
    this.el.hidden = false;
    buttons[0]?.focus({ preventScroll: true });
  }

  hide(): void {
    this.el.hidden = true;
    this.actions.replaceChildren();
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
  const hudContainer = el('div');
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
