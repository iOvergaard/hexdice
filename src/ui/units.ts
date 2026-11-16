// Unit visuals for a territory token. Three variants, all flat 2D, all keep the emblem and the dice count.
import { emblemPath } from './identity';

export type UnitVariant = 'cluster' | 'stack' | 'banners';

export function unitVariant(search: string): UnitVariant {
  const v = new URLSearchParams(search).get('units');
  return v === 'stack' || v === 'banners' ? v : 'cluster';
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
  6: [[0.3, 0.24], [0.7, 0.24], [0.3, 0.5], [0.7, 0.5], [0.3, 0.76], [0.7, 0.76]],
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

function stack(id: number, n: number): string {
  const w = 20;
  const h = 17;
  const step = n > 1 ? Math.min(9, 30 / (n - 1)) : 0;
  let out = '<ellipse class="u-ground" cx="-13" cy="24" rx="18" ry="3.6"/>';
  for (let i = 0; i < n; i++) {
    const x = -13 - w / 2 + (i % 2 === 0 ? -1 : 1.4);
    const y = 22 - h - i * step;
    out += `<rect class="u-die" x="${f(x)}" y="${f(y)}" width="${w}" height="${h}" rx="2.6"/>`;
    if (i === n - 1) out += `<path class="u-pip" d="${pips(x, y, w, h, face(id, i))}"/>`;
    else out += `<path class="u-edge" d="M${f(x + 2)} ${f(y + 1.8)}h${w - 4}"/>`;
  }
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
    ? el('rect', 'units-hit', { x: -38, y: -27, width: 78, height: 54, rx: 13 })
    : el('rect', 'token-plate', { x: -36, y: -29, width: 72, height: 58, rx: 13 });
  const art = el('g', 'units-art');
  const emblem = el('path', 'token-emblem');
  const count = el('text', 'token-count', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
  if (stackLayout) {
    const pill = el('rect', 'token-plate', { x: 3, y: -24, width: 32, height: 48, rx: 11 });
    emblem.setAttribute('transform', 'translate(19 -10)');
    count.setAttribute('x', '19');
    count.setAttribute('y', '10');
    root.append(plate, art, pill, emblem, count);
  } else {
    emblem.setAttribute('transform', 'translate(-13 -15)');
    count.setAttribute('x', '8');
    count.setAttribute('y', '-14');
    root.append(plate, art, emblem, count);
  }
  let lastDice = -1;
  let lastIdentity = -1;
  return {
    root,
    update(dice, identity) {
      if (dice !== lastDice) {
        art.innerHTML = variant === 'cluster' ? cluster(id, dice) : variant === 'stack' ? stack(id, dice) : banners(dice);
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
