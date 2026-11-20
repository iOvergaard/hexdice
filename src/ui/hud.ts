import type { GameState, PlayerId, Speed } from '../engine/types';
import { emblemPath, playerColour } from './identity';
import { soundToggle, type SoundToggle } from './sound-toggle';

export interface HudOptions {
  /** Largest connected group per player id. */
  largestGroups: number[];
  /** Runaways the Normal computer players gang up on (gangedUpOn in src/ai/runaway.ts). */
  gangedUpOn: ReadonlySet<PlayerId>;
  canEndTurn: boolean;
  /** While AIs play, the End turn button becomes a skip button: to your next turn, or to the end once you're out. */
  skip: 'turn' | 'end' | null;
  speed: Speed;
  mode: 'play' | 'replay';
  sound: boolean;
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

/** The runaway mark: a crosshair, so it reads without colour. */
function crosshairSvg(): SVGSVGElement {
  const s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('viewBox', '-12 -12 24 24');
  s.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('r', '6.5');
  const ticks = document.createElementNS(SVG_NS, 'path');
  ticks.setAttribute('d', 'M0 -11V-3M0 3V11M-11 0H-3M3 0H11');
  s.append(ring, ticks);
  return s;
}

export class Hud {
  private readonly chips: HTMLElement;
  private readonly round: HTMLElement;
  private readonly speed: HTMLSelectElement;
  private readonly endTurn: HTMLButtonElement;
  private readonly quit: HTMLButtonElement;
  private readonly help: HTMLButtonElement;
  private readonly sound: SoundToggle;
  private soundHandler: () => void = () => {};
  private endTurnHandler: () => void = () => {};
  private speedHandler: (speed: Speed) => void = () => {};
  private quitHandler: () => void = () => {};
  private helpHandler: () => void = () => {};

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

    this.sound = soundToggle();

    this.help = el('button', 'btn btn-quiet btn-icon help-button', '?');
    this.help.type = 'button';
    this.help.dataset.testid = 'help';
    this.help.setAttribute('aria-label', 'How to play');
    this.help.title = 'How to play';

    this.endTurn = el('button', 'btn btn-primary end-turn', 'End turn');
    this.endTurn.type = 'button';
    this.endTurn.dataset.testid = 'end-turn';

    const secondary = el('div', 'controls-secondary');
    secondary.append(this.round, speedLabel, this.help, this.sound.el, this.quit);
    controls.append(secondary, this.endTurn);
    container.append(this.chips, controls);

    this.endTurn.addEventListener('click', () => this.endTurnHandler());
    this.speed.addEventListener('change', () => this.speedHandler(this.speed.value as Speed));
    this.quit.addEventListener('click', () => this.quitHandler());
    this.sound.el.addEventListener('click', () => this.soundHandler());
    this.help.addEventListener('click', () => this.helpHandler());
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
  onHelp(h: () => void): void {
    this.helpHandler = h;
  }
  onSoundToggle(h: () => void): void {
    this.soundHandler = h;
  }

  render(state: GameState, opts: HudOptions): void {
    const humans = state.players.filter((p) => p.kind === 'human').length;
    const dice = state.players.map(() => 0);
    const held = state.players.map(() => 0);
    for (const t of state.territories) {
      dice[t.owner]! += t.dice;
      held[t.owner]!++;
    }
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
        const runaway = opts.gangedUpOn.has(p.id);
        li.classList.toggle('is-current', current);
        if (current) li.setAttribute('aria-current', 'true');

        const badge = el('span', 'chip-badge');
        badge.append(emblemSvg(p.identity));
        if (runaway) {
          const mark = el('span', 'chip-runaway');
          mark.dataset.testid = `player-${p.id}-runaway`;
          mark.title = `Runaway: the computer players are ganging up on ${isYou ? 'you' : 'them'}`;
          mark.append(crosshairSvg());
          badge.append(mark);
        }
        li.append(badge);
        li.append(el('span', 'chip-name', isYou ? 'You' : p.name));
        if (p.alive) {
          const stats = el('span', 'chip-stats');
          stats.append(el('span', 'chip-group', String(group)), el('span', 'chip-dice', String(dice[p.id])), el('span', 'chip-held', String(held[p.id])));
          li.append(stats);
          if (p.reserve > 0) li.append(el('span', 'chip-reserve', `+${p.reserve}`));
          const bonus = p.knockouts * state.config.eliminationBonus;
          if (bonus > 0) {
            const b = el('span', 'chip-bonus', `+${bonus}/turn`);
            b.dataset.testid = `player-${p.id}-bonus`;
            li.append(b);
          }
        } else {
          const stats = el('span', 'chip-stats');
          stats.append(el('span', 'chip-group', 'out'));
          li.append(stats);
        }
        li.setAttribute(
          'aria-label',
          `${isYou ? 'You' : p.name}${p.alive ? `, largest group ${group}, ${dice[p.id]} dice, ${held[p.id]} ${held[p.id] === 1 ? 'territory' : 'territories'}${p.reserve > 0 ? `, reserve ${p.reserve}` : ''}${p.knockouts * state.config.eliminationBonus > 0 ? `, knockout bonus ${p.knockouts * state.config.eliminationBonus} per turn` : ''}${runaway ? `, runaway: the computer players are ganging up on ${isYou ? 'you' : 'them'}` : ''}` : ', eliminated'}${current ? ', playing now' : ''}`,
        );
        return li;
      }),
    );

    this.round.textContent = `Round ${state.round}`;
    this.speed.value = opts.speed;
    this.sound.set(opts.sound);
    this.endTurn.disabled = !opts.canEndTurn && opts.skip === null;
    this.endTurn.textContent = opts.skip === 'turn' ? 'Skip to my turn' : opts.skip === 'end' ? 'Skip to the end' : 'End turn';
    this.endTurn.hidden = opts.mode === 'replay';
    this.quit.textContent = opts.mode === 'replay' ? 'Stop replay' : 'Quit';
  }
}
