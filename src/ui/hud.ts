import type { GameState, Speed } from '../engine/types';
import { emblemPath, playerColour } from './identity';

export interface HudOptions {
  /** Largest connected group per player id. */
  largestGroups: number[];
  canEndTurn: boolean;
  speed: Speed;
  mode: 'play' | 'replay';
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPEEDS: ReadonlyArray<[Speed, string]> = [
  ['slow', 'Slow'],
  ['normal', 'Normal'],
  ['fast', 'Fast'],
  ['instant', 'Instant'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function emblemSvg(identity: number): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '-12 -12 24 24');
  s.setAttribute('class', 'emblem');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', emblemPath(identity, 10));
  s.append(p);
  return s;
}

export class Hud {
  private readonly chips: HTMLElement;
  private readonly round: HTMLElement;
  private readonly speed: HTMLSelectElement;
  private readonly endTurn: HTMLButtonElement;
  private readonly quit: HTMLButtonElement;
  private endTurnHandler: () => void = () => {};
  private speedHandler: (speed: Speed) => void = () => {};
  private quitHandler: () => void = () => {};

  constructor(container: HTMLElement) {
    container.classList.add('hud');
    this.chips = el('ul', 'chips');
    this.chips.setAttribute('aria-label', 'Players');

    const controls = el('div', 'controls');
    this.round = el('span', 'round');
    this.round.dataset.testid = 'round';

    const speedLabel = el('label', 'speed');
    speedLabel.append(el('span', 'speed-label', 'Speed'));
    this.speed = el('select');
    this.speed.dataset.testid = 'speed';
    for (const [value, label] of SPEEDS) this.speed.append(new Option(label, value));
    speedLabel.append(this.speed);

    this.quit = el('button', 'btn btn-quiet', 'Quit');
    this.quit.type = 'button';
    this.quit.dataset.testid = 'quit';

    this.endTurn = el('button', 'btn btn-primary end-turn', 'End turn');
    this.endTurn.type = 'button';
    this.endTurn.dataset.testid = 'end-turn';

    const secondary = el('div', 'controls-secondary');
    secondary.append(this.round, speedLabel, this.quit);
    controls.append(secondary, this.endTurn);
    container.append(this.chips, controls);

    this.endTurn.addEventListener('click', () => this.endTurnHandler());
    this.speed.addEventListener('change', () => this.speedHandler(this.speed.value as Speed));
    this.quit.addEventListener('click', () => this.quitHandler());
  }

  onEndTurn(h: () => void): void {
    this.endTurnHandler = h;
  }
  onSpeedChange(h: (speed: Speed) => void): void {
    this.speedHandler = h;
  }
  onQuit(h: () => void): void {
    this.quitHandler = h;
  }

  render(state: GameState, opts: HudOptions): void {
    const humans = state.players.filter((p) => p.kind === 'human').length;
    this.chips.replaceChildren(
      ...state.players.map((p) => {
        const group = opts.largestGroups[p.id] ?? 0;
        const isYou = humans === 1 && p.kind === 'human';
        const li = el('li', 'chip');
        li.dataset.testid = `player-${p.id}`;
        li.style.setProperty('--c', playerColour(p.identity));
        li.classList.toggle('is-you', isYou);
        li.classList.toggle('is-out', !p.alive);
        const current = p.id === state.current && p.alive && state.winner === null;
        li.classList.toggle('is-current', current);
        if (current) li.setAttribute('aria-current', 'true');

        const badge = el('span', 'chip-badge');
        badge.append(emblemSvg(p.identity));
        li.append(badge);
        li.append(el('span', 'chip-name', isYou ? 'You' : p.name));
        if (p.alive) {
          li.append(el('span', 'chip-group', String(group)));
          if (p.reserve > 0) li.append(el('span', 'chip-reserve', `+${p.reserve}`));
        } else {
          li.append(el('span', 'chip-group', 'out'));
        }
        li.setAttribute(
          'aria-label',
          `${isYou ? 'You' : p.name}${p.alive ? `, largest group ${group}${p.reserve > 0 ? `, reserve ${p.reserve}` : ''}` : ', eliminated'}${current ? ', playing now' : ''}`,
        );
        return li;
      }),
    );

    this.round.textContent = `Round ${state.round}`;
    this.speed.value = opts.speed;
    this.endTurn.disabled = !opts.canEndTurn;
    this.endTurn.hidden = opts.mode === 'replay';
    this.quit.textContent = opts.mode === 'replay' ? 'Stop replay' : 'Quit';
  }
}
