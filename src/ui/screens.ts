import type { AiLevel } from '../engine/types';
import { MAX_PLAYERS, MIN_PLAYERS } from '../engine/config';
import { BoardView } from './board-view';
import { Hud } from './hud';
import { PALETTE, emblemPath } from './identity';
import { RollView } from './roll-view';

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

export function showTitle(root: HTMLElement, initial: TitleOptions, onStart: (opts: TitleOptions) => void): void {
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

  screen.append(playersWrap, aiWrap, start);
  root.replaceChildren(screen);
}

export class PreviewPrompt {
  private readonly el: HTMLElement;
  private readonly seed: HTMLElement;
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
    text.append(el('p', 'preview-question', 'Play this board?'));
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

  show(seed: number, handlers: { onYes: () => void; onNo: () => void }): void {
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

export interface GameScreen {
  board: BoardView;
  roll: RollView;
  hud: Hud;
  preview: PreviewPrompt;
  overlay: GameOverOverlay;
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
    hud: new Hud(hudContainer),
    preview: new PreviewPrompt(barSlot, hudContainer),
  };
}
