// Unit visuals for a territory token. Three variants, all keep the emblem and the dice count.
import { emblemPath } from './identity';

export type UnitVariant = 'cluster' | 'stack' | 'banners';

/** Stack is the default (Jacob's pick, 16-11-2026); `?units=cluster|banners` keeps the others for comparison. */
export function unitVariant(search: string): UnitVariant {
  const v = new URLSearchParams(search).get('units');
  return v === 'cluster' || v === 'banners' ? v : 'stack';
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const f = (v: number) => Math.round(v * 10) / 10;

/** Cosmetic face, deterministic per territory and die slot. */
function face(territory: number, slot: number): number {
  let h = Math.imul(territory + 1, 2654435761) ^ Math.imul(slot + 7, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) % 6 + 1;
}

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
};

/** Pips for a die whose top-left is x,y and whose face is w by h. */
function pips(x: number, y: number, w: number, h: number, value: number): string {
  const r = Math.min(w, h) * 0.1;
  return PIPS[value]!
    .map(([px, py]) => `M${f(x + px * w - r)} ${f(y + py * h)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`)
    .join('');
}

function cluster(id: number, n: number): string {
  const s = 12;
  const gap = 2;
  const rows = n > 4 ? 2 : 1;
  let out = '';
  let pipPath = '';
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4);
    const inRow = row === 0 ? Math.min(n, 4) : n - 4;
    const col = i % 4;
    const x = -(inRow * s + (inRow - 1) * gap) / 2 + col * (s + gap);
    const y = (rows === 1 ? 5 : 0) + row * (s + gap) + 0.5;
    out += `<rect class="u-die" x="${f(x)}" y="${f(y)}" width="${s}" height="${s}" rx="2.4"/>`;
    pipPath += pips(x, y, s, s, face(id, i));
  }
  return out + `<path class="u-pip" d="${pipPath}"/>`;
}

/** Dice per stack: up to 3 stand in one stack, 4+ split into two side by side, the left one never shorter. */
export function stackSplit(n: number): number[] {
  return n <= 3 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
}

// Dice in a 3/4 view (oblique, not isometric): front face W by H, side and top faces sheared DX right and DY up.
const W = 19;
const H = 17;
const DX = 5;
const DY = 4.5;
/** Each die sits STEP above the one below, a little less than H so the seams overlap. */
const STEP = 14;
const GAP = 2;
/** Where the dice stand. */
const BASE = 24;
const PILL_W = 26;
const PILL_GAP = 4;

function stacksWidth(n: number): number {
  const cols = stackSplit(n).length;
  return cols * (W + DX) + (cols - 1) * GAP;
}

function die(x: number, y: number, value: number, top: boolean): string {
  let out =
    `<path class="u-side" d="M${f(x + W)} ${f(y)}l${DX} ${-DY}v${H}l${-DX} ${DY}z"/>` +
    `<rect class="u-face" x="${f(x)}" y="${f(y)}" width="${W}" height="${H}" rx="1.4"/>`;
  // Pips on the top die only: on a phone, pips on every die read as noise.
  if (top) {
    out += `<path class="u-top" d="M${f(x)} ${f(y)}l${DX} ${-DY}h${W}l${-DX} ${DY}z"/>`;
    out += `<path class="u-pip" d="${pips(x + 0.5, y + 0.5, W - 1, H - 1, value)}"/>`;
  }
  return out;
}

function stacks(id: number, n: number): string {
  const width = stacksWidth(n);
  let out = `<ellipse class="u-ground" cx="${f(width / 2)}" cy="${BASE + 1.5}" rx="${f(width / 2 + 5)}" ry="4"/>`;
  let slot = 0;
  stackSplit(n).forEach((count, col) => {
    const x0 = col * (W + DX + GAP);
    for (let i = 0; i < count; i++) {
      // A slight wobble so a stack reads as stacked dice, not a bar.
      const x = x0 + (i % 2 === 0 ? 0 : 0.9);
      out += die(x, BASE - H - i * STEP, face(id, slot++), i === count - 1);
    }
  });
  return out;
}

function banners(n: number): string {
  const pitch = 14;
  const rows = n > 4 ? 2 : 1;
  let out = '';
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4);
    const inRow = row === 0 ? Math.min(n, 4) : n - 4;
    const col = i % 4;
    const x = -((inRow - 1) * pitch) / 2 + col * pitch - 3;
    const y = rows === 1 ? 24 : 17 + row * 10;
    out +=
      `<ellipse class="u-base" cx="${f(x)}" cy="${y}" rx="4.4" ry="1.9"/>` +
      `<path class="u-pole" d="M${f(x)} ${y}V${y - 18}"/>` +
      `<path class="u-flag" d="M${f(x)} ${y - 18}L${f(x + 10.5)} ${y - 14}L${f(x)} ${y - 9}z"/>`;
  }
  return out;
}

export interface UnitView {
  root: SVGGElement;
  update(dice: number, identity: number): void;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, cls: string, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  e.setAttribute('class', cls);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function createUnits(variant: UnitVariant, id: number): UnitView {
  const root = el('g', `units units-${variant}`);
  const stackLayout = variant === 'stack';
  // Keeps the whole token tappable, whatever the dice shapes leave empty.
  const plate = stackLayout
    ? el('rect', 'units-hit', { rx: 13 })
    : el('rect', 'token-plate', { x: -36, y: -29, width: 72, height: 58, rx: 13 });
  const art = el('g', 'units-art');
  const emblem = el('path', 'token-emblem');
  const count = el('text', 'token-count', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  const pill = el('rect', 'token-plate', { y: BASE - 46, width: PILL_W, height: 46, rx: 11 });
  if (stackLayout) {
    count.setAttribute('y', String(BASE - 13));
    root.append(plate, art, pill, emblem, count);
  } else {
    emblem.setAttribute('transform', 'translate(-13 -15)');
    count.setAttribute('x', '8');
    count.setAttribute('y', '-14');
    root.append(plate, art, emblem, count);
  }
  /** Centres [dice][pill] on the territory and fits the hit area round both. */
  const place = (dice: number) => {
    const w = stacksWidth(dice);
    const total = w + PILL_GAP + PILL_W;
    const left = -total / 2;
    const px = left + w + PILL_GAP;
    art.setAttribute('transform', `translate(${f(left)} 0)`);
    pill.setAttribute('x', String(f(px)));
    emblem.setAttribute('transform', `translate(${f(px + PILL_W / 2)} ${BASE - 32})`);
    count.setAttribute('x', String(f(px + PILL_W / 2)));
    const top = Math.min(BASE - 46, BASE - H - (stackSplit(dice)[0]! - 1) * STEP - DY) - 4;
    plate.setAttribute('x', String(f(left - 4)));
    plate.setAttribute('y', String(f(top)));
    plate.setAttribute('width', String(f(total + 8)));
    plate.setAttribute('height', String(f(BASE + 6 - top)));
  };
  let lastDice = -1;
  let lastIdentity = -1;
  return {
    root,
    update(dice, identity) {
      if (dice !== lastDice) {
        art.innerHTML = variant === 'cluster' ? cluster(id, dice) : variant === 'stack' ? stacks(id, dice) : banners(dice);
        if (stackLayout) place(dice);
        count.textContent = String(dice);
        lastDice = dice;
      }
      if (identity !== lastIdentity) {
        emblem.setAttribute('d', emblemPath(identity, 8));
        lastIdentity = identity;
      }
    },
  };
}
