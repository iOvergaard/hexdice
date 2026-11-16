import type { AttackRolledEvent, GameState, Player } from '../engine/types';
import { emblemPath, playerColour } from './identity';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Pip positions on a 100 x 100 face, by face value.
const L = 27;
const M = 50;
const R = 73;
const PIPS: Record<number, Array<[number, number]>> = {
  1: [[M, M]],
  2: [[L, L], [R, R]],
  3: [[L, L], [M, M], [R, R]],
  4: [[L, L], [R, L], [L, R], [R, R]],
  5: [[L, L], [R, L], [M, M], [L, R], [R, R]],
  6: [[L, L], [R, L], [L, M], [R, M], [L, R], [R, R]],
};

function dieFace(value: number, colour: string): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '0 0 100 100');
  el.setAttribute('class', 'die');
  el.setAttribute('role', 'img');
  el.dataset.value = String(value);
  el.setAttribute('aria-label', String(value));
  el.style.setProperty('--c', colour);
  const plate = document.createElementNS(SVG_NS, 'rect');
  plate.setAttribute('x', '5');
  plate.setAttribute('y', '5');
  plate.setAttribute('width', '90');
  plate.setAttribute('height', '90');
  plate.setAttribute('rx', '20');
  plate.setAttribute('class', 'die-plate');
  el.append(plate);
  for (const [x, y] of PIPS[value] ?? []) {
    const pip = document.createElementNS(SVG_NS, 'circle');
    pip.setAttribute('cx', String(x));
    pip.setAttribute('cy', String(y));
    pip.setAttribute('r', '9');
    pip.setAttribute('class', 'die-pip');
    el.append(pip);
  }
  return el;
}

function emblemSvg(identity: number): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', '-12 -12 24 24');
  el.setAttribute('class', 'emblem');
  el.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', emblemPath(identity, 10));
  el.append(p);
  return el;
}

interface Side {
  el: HTMLElement;
  who: HTMLElement;
  dice: HTMLElement;
  sum: HTMLElement;
}

function makeSide(role: 'defender' | 'attacker'): Side {
  const el = document.createElement('div');
  el.className = `roll-side roll-${role}`;
  el.dataset.testid = `roll-${role}`;
  const who = document.createElement('div');
  who.className = 'roll-who';
  const dice = document.createElement('div');
  dice.className = 'roll-dice';
  const sum = document.createElement('div');
  sum.className = 'roll-sum';
  sum.dataset.testid = `roll-${role}-sum`;
  el.append(who, dice, sum);
  return { el, who, dice, sum };
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class RollView {
  private readonly root: HTMLElement;
  private readonly defender = makeSide('defender');
  private readonly attacker = makeSide('attacker');
  private readonly mid: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly msg: HTMLElement;
  private timer: ReturnType<typeof setInterval> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private finish: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('section');
    this.root.className = 'roll is-idle';
    this.root.dataset.testid = 'roll';
    this.root.setAttribute('aria-label', 'Latest attack');
    this.root.setAttribute('aria-live', 'polite');
    this.mid = document.createElement('div');
    this.mid.className = 'roll-mid';
    this.hint = document.createElement('p');
    this.hint.className = 'roll-hint';
    this.hint.textContent = 'Attack rolls appear here';
    this.msg = document.createElement('p');
    this.msg.className = 'roll-message';
    this.msg.dataset.testid = 'roll-message';
    this.root.append(this.defender.el, this.mid, this.attacker.el, this.hint, this.msg);
    container.append(this.root);
  }

  show(event: AttackRolledEvent, state: GameState, durationMs: number): Promise<void> {
    this.stop();
    this.root.classList.remove('is-idle', 'is-settled', 'is-message');
    this.msg.textContent = '';
    this.root.classList.add('is-rolling');

    const att = state.players[event.attacker];
    const def = state.players[event.defender];
    this.fillSide(this.attacker, att, event.attackRolls);
    this.fillSide(this.defender, def, event.defendRolls);
    for (const s of [this.attacker, this.defender]) {
      s.el.classList.remove('is-winner', 'is-loser');
      s.sum.textContent = '';
    }
    this.mid.textContent = 'vs';

    const settle = () => {
      this.timer = null;
      this.settleTimer = null;
      this.paintDice(this.attacker, att, event.attackRolls);
      this.paintDice(this.defender, def, event.defendRolls);
      this.attacker.sum.textContent = String(event.attackSum);
      this.defender.sum.textContent = String(event.defendSum);
      this.attacker.el.classList.toggle('is-winner', event.success);
      this.attacker.el.classList.toggle('is-loser', !event.success);
      this.defender.el.classList.toggle('is-winner', !event.success);
      this.defender.el.classList.toggle('is-loser', event.success);
      this.mid.textContent = event.success ? 'Captured' : 'Held';
      this.root.classList.remove('is-rolling');
      this.root.classList.add('is-settled');
      const done = this.finish;
      this.finish = null;
      done?.();
    };

    return new Promise<void>((resolve) => {
      this.finish = resolve;
      if (durationMs <= 0) {
        settle();
        return;
      }
      const tumbleMs = durationMs * 0.7;
      if (!reducedMotion()) {
        const shuffle = () => {
          this.paintDice(this.attacker, att, event.attackRolls, true);
          this.paintDice(this.defender, def, event.defendRolls, true);
        };
        shuffle();
        this.timer = setInterval(shuffle, 80);
        this.settleTimer = setTimeout(() => {
          if (this.timer) clearInterval(this.timer);
          this.timer = null;
          this.paintDice(this.attacker, att, event.attackRolls);
          this.paintDice(this.defender, def, event.defendRolls);
          this.settleTimer = setTimeout(settle, durationMs - tumbleMs);
        }, tumbleMs);
      } else {
        this.settleTimer = setTimeout(settle, durationMs);
      }
    });
  }

  /** Replaces the dice with a line of text until the next roll or clear. */
  message(text: string): void {
    this.clear();
    this.root.classList.remove('is-idle');
    this.root.classList.add('is-message');
    this.msg.textContent = text;
  }

  clear(): void {
    this.stop();
    this.msg.textContent = '';
    this.root.classList.remove('is-rolling', 'is-settled', 'is-message');
    this.root.classList.add('is-idle');
    for (const s of [this.attacker, this.defender]) {
      s.el.classList.remove('is-winner', 'is-loser');
      s.who.replaceChildren();
      s.dice.replaceChildren();
      s.sum.textContent = '';
    }
    this.mid.textContent = '';
  }

  /** Cancels a running animation and releases its promise. */
  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.timer = null;
    this.settleTimer = null;
    const done = this.finish;
    this.finish = null;
    done?.();
  }

  private fillSide(side: Side, player: Player | undefined, rolls: number[]): void {
    const identity = player?.identity ?? 0;
    side.el.style.setProperty('--c', playerColour(identity));
    const name = document.createElement('span');
    name.className = 'roll-name';
    name.textContent = player?.name ?? '';
    side.who.replaceChildren(emblemSvg(identity), name);
    this.paintDice(side, player, rolls, true);
  }

  private paintDice(side: Side, player: Player | undefined, rolls: number[], random = false): void {
    const colour = playerColour(player?.identity ?? 0);
    side.dice.replaceChildren(...rolls.map((v) => dieFace(random ? 1 + Math.floor(Math.random() * 6) : v, colour)));
  }
}
