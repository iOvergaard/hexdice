import { diceAfterFailedAttack } from '../engine/rules';
import type { AttackRolledEvent, GameState, Player } from '../engine/types';
import { darken, emblemPath, pipColour, playerColour } from './identity';
import { CUBE_VIEWBOX, cubeDie } from './units';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A rolled die, drawn as the cube on top of a board stack. */
function dieFace(value: number): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', CUBE_VIEWBOX);
  el.setAttribute('class', 'die');
  el.setAttribute('role', 'img');
  el.dataset.value = String(value);
  el.setAttribute('aria-label', String(value));
  el.innerHTML = cubeDie(value);
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
  /** What the roll cost this side, shown once the dice settle. */
  cost: HTMLElement;
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
  const cost = document.createElement('div');
  cost.className = 'roll-cost';
  cost.dataset.testid = `roll-${role}-cost`;
  el.append(who, dice, sum, cost);
  return { el, who, dice, sum, cost };
}

interface Pile {
  el: HTMLElement;
  who: HTMLElement;
  count: HTMLElement;
  dice: HTMLElement;
  caption: HTMLElement;
}

function makePile(): Pile {
  const el = document.createElement('div');
  el.className = 'roll-pile';
  el.dataset.testid = 'roll-pile';
  const who = document.createElement('div');
  who.className = 'roll-who';
  // The caption says it in words; screen readers shouldn't hear every die land.
  const count = document.createElement('div');
  count.className = 'roll-pile-count';
  count.dataset.testid = 'roll-pile-count';
  count.setAttribute('aria-hidden', 'true');
  const dice = document.createElement('div');
  dice.className = 'roll-dice';
  dice.setAttribute('aria-hidden', 'true');
  const caption = document.createElement('p');
  caption.className = 'roll-pile-caption';
  caption.dataset.testid = 'roll-pile-caption';
  const row = document.createElement('div');
  row.className = 'roll-pile-row';
  row.append(who, count, dice);
  el.append(row, caption);
  return { el, who, count, dice, caption };
}

/** Cubes drawn in a reinforcement pile at most; a bigger pile drains in proportion. */
const PILE_CUBES = 12;
const PILE_FACES = [5, 2, 6, 3, 1, 4];

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Share of a roll spent tumbling; the dice land then and the result shows at the end. Sound times its rattle to it. */
export const TUMBLE_SHARE = 0.7;

export class RollView {
  private readonly root: HTMLElement;
  private readonly defender = makeSide('defender');
  private readonly attacker = makeSide('attacker');
  private readonly mid: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly pileView = makePile();
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
    this.root.append(this.defender.el, this.mid, this.attacker.el, this.hint, this.msg, this.pileView.el);
    container.append(this.root);
  }

  show(event: AttackRolledEvent, state: GameState, durationMs: number): Promise<void> {
    this.stop();
    this.root.classList.remove('is-idle', 'is-settled', 'is-message', 'is-pile');
    this.msg.textContent = '';
    this.root.classList.add('is-rolling');

    const att = state.players[event.attacker];
    const def = state.players[event.defender];
    this.fillSide(this.attacker, att, event.attackRolls);
    this.fillSide(this.defender, def, event.defendRolls);
    for (const s of [this.attacker, this.defender]) {
      s.el.classList.remove('is-winner', 'is-loser');
      s.sum.textContent = '';
      s.cost.textContent = '';
    }
    this.mid.textContent = 'vs';

    const settle = () => {
      this.timer = null;
      this.settleTimer = null;
      this.paintDice(this.attacker, event.attackRolls);
      this.paintDice(this.defender, event.defendRolls);
      this.attacker.sum.textContent = String(event.attackSum);
      this.defender.sum.textContent = String(event.defendSum);
      this.attacker.el.classList.toggle('is-winner', event.success);
      this.attacker.el.classList.toggle('is-loser', !event.success);
      this.defender.el.classList.toggle('is-winner', !event.success);
      this.defender.el.classList.toggle('is-loser', event.success);
      const a = event.attackRolls.length;
      const d = event.defendRolls.length;
      const draw = event.attackSum === event.defendSum;
      const left = event.success ? 1 : diceAfterFailedAttack(state.config, a, d, draw);
      const held = !event.success && state.config.shaken;
      this.attacker.cost.textContent = event.success ? `${a - 1} moved in` : `${a} → ${left}${held && left >= 2 ? ' · spent' : ''}`;
      this.defender.cost.textContent = event.success ? `lost ${d}` : held ? 'shaken' : `kept ${d}`;
      this.mid.textContent = event.success ? (draw ? 'Tie · captured' : 'Captured') : draw ? 'Draw' : 'Held';
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
      const tumbleMs = durationMs * TUMBLE_SHARE;
      if (!reducedMotion()) {
        const shuffle = () => {
          this.paintDice(this.attacker, event.attackRolls, true);
          this.paintDice(this.defender, event.defendRolls, true);
        };
        shuffle();
        this.timer = setInterval(shuffle, 80);
        this.settleTimer = setTimeout(() => {
          if (this.timer) clearInterval(this.timer);
          this.timer = null;
          this.paintDice(this.attacker, event.attackRolls);
          this.paintDice(this.defender, event.defendRolls);
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

  /** End of turn: a player's new dice as a pile that drains as they land. Returns a setter for the dice still in it. */
  pile(player: Player, total: number, caption: string): (left: number) => void {
    this.clear();
    this.root.classList.remove('is-idle');
    this.root.classList.add('is-pile');
    const p = this.pileView;
    const colour = playerColour(player.identity);
    p.el.style.setProperty('--c', colour);
    p.el.style.setProperty('--cd', darken(colour));
    p.el.style.setProperty('--pip', pipColour(colour));
    const name = document.createElement('span');
    name.className = 'roll-name';
    name.textContent = player.name;
    p.who.replaceChildren(emblemSvg(player.identity), name);
    const cubes = Array.from({ length: Math.min(total, PILE_CUBES) }, (_, i) => dieFace(PILE_FACES[i % PILE_FACES.length]!));
    p.dice.replaceChildren(...cubes);
    p.caption.textContent = caption;
    const set = (left: number) => {
      const shown = total > 0 ? Math.ceil((left / total) * cubes.length) : 0;
      cubes.forEach((c, i) => c.classList.toggle('is-gone', i >= shown));
      p.count.textContent = String(left);
      p.el.classList.toggle('is-empty', left === 0);
    };
    set(total);
    return set;
  }

  clear(): void {
    this.stop();
    this.msg.textContent = '';
    this.root.classList.remove('is-rolling', 'is-settled', 'is-message', 'is-pile');
    this.root.classList.add('is-idle');
    for (const s of [this.attacker, this.defender]) {
      s.el.classList.remove('is-winner', 'is-loser');
      s.who.replaceChildren();
      s.dice.replaceChildren();
      s.sum.textContent = '';
      s.cost.textContent = '';
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
    const colour = playerColour(identity);
    side.el.style.setProperty('--c', colour);
    side.el.style.setProperty('--cd', darken(colour));
    side.el.style.setProperty('--pip', pipColour(colour));
    const name = document.createElement('span');
    name.className = 'roll-name';
    name.textContent = player?.name ?? '';
    side.who.replaceChildren(emblemSvg(identity), name);
    this.paintDice(side, rolls, true);
  }

  private paintDice(side: Side, rolls: number[], random = false): void {
    side.dice.replaceChildren(...rolls.map((v) => dieFace(random ? 1 + Math.floor(Math.random() * 6) : v)));
  }
}
