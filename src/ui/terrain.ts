// Procedural painted-landscape terrain for the board. Pure string building (no DOM), deterministic from the seed.
import { DIRS, cellCorner, neighbour, neighbours } from '../engine/hex';
import type { Point } from '../engine/hex';
import { Rng } from '../engine/rng';
import type { Board, Territory } from '../engine/types';

export interface Terrain {
  defs: string;
  /** Sea tones and waves. */
  sea: string;
  /** Land base, meadow tints, lakes' footing and terrain details. Drawn under the owner wash. */
  ground: string;
  /** Beach, lake shores and shorelines. Drawn over the owner wash. */
  over: string;
  /** Clip shape for the owner wash: the land minus the lakes (evenodd). */
  clipD: string;
}

export const LAND_CLIP_ID = 'hd-land';
export const FRAME_CLIP_ID = 'hd-frame';

const SQRT3 = Math.sqrt(3);
const MARGIN = 7;
const EVEN_ROW = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]] as const;
const ODD_ROW = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]] as const;

const SEA_TONES = ['#1d4f86', '#27659a', '#3a80b1', '#5ba0c5', '#8cc5d3'];
const LAND_BASE = '#93be62';
const LAND_TINTS = ['#bdd27c', '#a7c96a', LAND_BASE, '#80b05b', '#6ea458'];
const SAND = '#e9d6a0';
const SHORE = '#85703f';

const f1 = (v: number) => Math.round(v * 10) / 10;

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function circle(cx: number, cy: number, r: number): string {
  return `M${f1(cx - r)} ${f1(cy)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0z`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f1(cx - rx)} ${f1(cy)}a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(2 * rx)} 0a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-2 * rx)} 0z`;
}

/** One Chaikin pass then a quadratic B-spline through the midpoints: smooth, closed, and cheap in path bytes. */
function smooth(loop: Point[]): string {
  const ch: Point[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    ch.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  const n = ch.length;
  const mid = (a: Point, b: Point) => `${f1((a.x + b.x) / 2)} ${f1((a.y + b.y) / 2)}`;
  let d = `M${mid(ch[n - 1]!, ch[0]!)}`;
  for (let i = 0; i < n; i++) d += `Q${f1(ch[i]!.x)} ${f1(ch[i]!.y)} ${mid(ch[i]!, ch[(i + 1) % n]!)}`;
  return d + 'Z';
}

export function buildTerrain(board: Board, territories: readonly Territory[], seed: number, hex: number, pad: number, frameW: number, frameH: number): Terrain {
  const { width: W, height: H, cellTerritory } = board;
  const idx = (c: number, r: number) => r * W + c;
  const inGrid = (c: number, r: number) => c >= 0 && c < W && r >= 0 && r < H;
  const cx = (c: number, r: number) => hex * SQRT3 * (c + 0.5 * (r & 1)) + (hex * SQRT3) / 2 + pad;
  const cy = (r: number) => hex * 1.5 * r + hex + pad;
  const step = (c: number, r: number, d: number): [number, number] => {
    const [dc, dr] = ((r & 1) !== 0 ? ODD_ROW : EVEN_ROW)[d]!;
    return [c + dc, r + dr];
  };

  // Water reachable from the grid edge is sea; enclosed water is a lake.
  const sea = new Uint8Array(W * H);
  const queue: number[] = [];
  const seed0 = (cell: number) => {
    if (cellTerritory[cell] === -1 && !sea[cell]) {
      sea[cell] = 1;
      queue.push(cell);
    }
  };
  for (let c = 0; c < W; c++) {
    seed0(idx(c, 0));
    seed0(idx(c, H - 1));
  }
  for (let r = 0; r < H; r++) {
    seed0(idx(0, r));
    seed0(idx(W - 1, r));
  }
  for (let q = 0; q < queue.length; q++) for (const nb of neighbours(queue[q]!, W, H)) seed0(nb);

  // Sea depth: steps from the nearest non-sea cell.
  const dist = new Float32Array(W * H).fill(Infinity);
  const bfs: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!sea[i]) {
      dist[i] = 0;
      bfs.push(i);
    }
  }
  for (let q = 0; q < bfs.length; q++) {
    for (const nb of neighbours(bfs[q]!, W, H)) {
      if (sea[nb] && dist[nb] === Infinity) {
        dist[nb] = dist[bfs[q]!]! + 1;
        bfs.push(nb);
      }
    }
  }
  const depthAt = (c: number, r: number): number => {
    if (inGrid(c, r)) return dist[idx(c, r)]!;
    const cc = Math.min(W - 1, Math.max(0, c));
    const rr = Math.min(H - 1, Math.max(0, r));
    return dist[idx(cc, rr)]! + Math.abs(c - cc) + Math.abs(r - rr);
  };

  // Boundary loops of a cell set, clockwise, with each vertex nudged by a position hash so every layer agrees.
  const loopsOf = (pred: (c: number, r: number) => boolean): Point[][] => {
    const from: Point[] = [];
    const to: Point[] = [];
    const key = (p: Point) => `${Math.round(p.x * 4)},${Math.round(p.y * 4)}`;
    for (let r = -MARGIN; r < H + MARGIN; r++) {
      for (let c = -MARGIN; c < W + MARGIN; c++) {
        if (!pred(c, r)) continue;
        const centre = { x: cx(c, r), y: cy(r) };
        for (const d of DIRS) {
          const [nc, nr] = step(c, r, d);
          if (pred(nc, nr)) continue;
          from.push(cellCorner(centre, hex, d));
          to.push(cellCorner(centre, hex, (d + 1) % 6));
        }
      }
    }
    const starts = new Map<string, number[]>();
    from.forEach((p, i) => {
      const k = key(p);
      const list = starts.get(k);
      if (list) list.push(i);
      else starts.set(k, [i]);
    });
    const used = new Uint8Array(from.length);
    const loops: Point[][] = [];
    for (let i = 0; i < from.length; i++) {
      if (used[i]) continue;
      const loop: Point[] = [];
      let cur = i;
      const startKey = key(from[i]!);
      for (;;) {
        used[cur] = 1;
        const p = from[cur]!;
        const a = hash2(Math.round(p.x * 4), Math.round(p.y * 4), seed) - 0.5;
        const b = hash2(Math.round(p.y * 4), Math.round(p.x * 4), seed ^ 0x9e37) - 0.5;
        loop.push({ x: p.x + a * hex * 0.22, y: p.y + b * hex * 0.22 });
        const k = key(to[cur]!);
        if (k === startKey) break;
        const nxt = starts.get(k)?.find((e) => !used[e]);
        if (nxt === undefined) break;
        cur = nxt;
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  };
  const pathOf = (loops: Point[][]) => loops.map(smooth).join('');

  const isLandish = (c: number, r: number) => inGrid(c, r) && !sea[idx(c, r)];
  const landD = pathOf(loopsOf(isLandish));
  const lakeD = pathOf(loopsOf((c, r) => inGrid(c, r) && !sea[idx(c, r)] && cellTerritory[idx(c, r)] === -1));

  // ---- sea tones, from deep (rect) to shallow ----
  let seaSvg = `<rect x="0" y="0" width="${f1(frameW)}" height="${f1(frameH)}" fill="${SEA_TONES[0]}"/><g filter="url(#hd-soft-sea)">`;
  for (let k = 4; k >= 1; k--) {
    const d = pathOf(loopsOf((c, r) => (inGrid(c, r) ? !sea[idx(c, r)] || dist[idx(c, r)]! <= k : depthAt(c, r) <= k)));
    seaSvg += `<path d="${d}" fill="${SEA_TONES[5 - k]}"/>`;
  }
  seaSvg += '</g>';
  // A pale surf halo just off the coast, under the land.
  seaSvg += `<path d="${landD}" fill="none" stroke="#eaf7f3" stroke-opacity=".5" stroke-width="7" stroke-linejoin="round" filter="url(#hd-soft-surf)"/>`;

  // Gentle wave strokes in open water.
  const rng = new Rng((seed ^ 0x57a11) >>> 0);
  const open: number[] = [];
  for (let i = 0; i < W * H; i++) if (sea[i] && dist[i]! >= 2) open.push(i);
  const waves = Math.min(26, Math.round(open.length / 14));
  let waveD = '';
  for (let i = 0; i < waves && open.length > 0; i++) {
    const cell = open[rng.int(open.length)]!;
    const c = cell % W;
    const r = Math.floor(cell / W);
    const x = cx(c, r) + (rng.next() - 0.5) * hex;
    const y = cy(r) + (rng.next() - 0.5) * hex;
    const s = 0.8 + rng.next() * 0.6;
    waveD += `M${f1(x)} ${f1(y)}q${f1(3 * s)} ${f1(-2.6 * s)} ${f1(6 * s)} 0t${f1(6 * s)} 0t${f1(6 * s)} 0`;
    if (rng.next() < 0.5) waveD += `M${f1(x + 5)} ${f1(y + 5)}q${f1(2.5 * s)} ${f1(-2 * s)} ${f1(5 * s)} 0t${f1(5 * s)} 0`;
  }
  seaSvg += `<path d="${waveD}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.3" stroke-linecap="round"/>`;

  // ---- land: base, low-frequency meadow tints (blurred, clipped to the land) ----
  const p1 = rng.next() * 6.28;
  const p2 = rng.next() * 6.28;
  const p3 = rng.next() * 6.28;
  const cells: { cell: number; v: number }[] = [];
  for (let i = 0; i < W * H; i++) {
    if (cellTerritory[i] === -1) continue;
    const c = i % W;
    const r = Math.floor(i / W);
    const v = Math.sin(c * 0.29 + p1) * 0.5 + Math.sin(r * 0.36 + p2) * 0.35 + Math.sin((c + r) * 0.17 + p3) * 0.45 + (hash2(c, r, seed) - 0.5) * 0.7;
    cells.push({ cell: i, v });
  }
  const ranked = [...cells].sort((a, b) => a.v - b.v);
  const tintD: string[] = LAND_TINTS.map(() => '');
  ranked.forEach(({ cell }, i) => {
    const level = Math.min(LAND_TINTS.length - 1, Math.floor((i / ranked.length) * LAND_TINTS.length));
    const c = cell % W;
    const r = Math.floor(cell / W);
    const centre = { x: cx(c, r), y: cy(r) };
    tintD[level] += 'M' + Array.from({ length: 6 }, (_, k) => cellCorner(centre, hex, k)).map((p) => `${f1(p.x)} ${f1(p.y)}`).join('L') + 'Z';
  });
  let ground = `<path d="${landD}" fill="${LAND_BASE}"/><g clip-path="url(#${LAND_CLIP_ID})"><g filter="url(#hd-soft-land)">`;
  tintD.forEach((d, i) => {
    if (d && i !== 2) ground += `<path d="${d}" fill="${LAND_TINTS[i]}" stroke="${LAND_TINTS[i]}" stroke-width="3" stroke-linejoin="round"/>`;
  });
  ground += '</g></g>';

  // ---- seeded details: about one per four land cells, never on a centre cell or its direct neighbours ----
  const reserved = new Set<number>();
  for (const t of territories) {
    reserved.add(t.centre);
    for (const nb of neighbours(t.centre, W, H)) reserved.add(nb);
  }
  const L = { shadow: '', trunk: '', pineD: '', pine: '', leafD: '', leaf: '', leafHi: '', hill: '', hillShade: '', hillHi: '', rockD: '', rock: '', rockHi: '' };
  const tree = (x: number, y: number, s: number) => {
    L.shadow += ellipse(x + 1.5 * s, y + 0.6 * s, 5 * s, 1.7 * s);
    L.trunk += `M${f1(x - 0.9 * s)} ${f1(y)}h${f1(1.8 * s)}v${f1(-3.2 * s)}h${f1(-1.8 * s)}z`;
    L.leafD += circle(x, y - 6 * s, 4.6 * s);
    L.leaf += circle(x - 0.7 * s, y - 6.8 * s, 3.7 * s);
    L.leafHi += circle(x - 1.6 * s, y - 8 * s, 1.5 * s);
  };
  const pine = (x: number, y: number, s: number) => {
    L.shadow += ellipse(x + 1.5 * s, y + 0.6 * s, 4.2 * s, 1.5 * s);
    L.trunk += `M${f1(x - 0.8 * s)} ${f1(y)}h${f1(1.6 * s)}v${f1(-2.4 * s)}h${f1(-1.6 * s)}z`;
    L.pineD += `M${f1(x - 4.4 * s)} ${f1(y - 2 * s)}L${f1(x)} ${f1(y - 9 * s)}L${f1(x + 4.4 * s)} ${f1(y - 2 * s)}z`;
    L.pine += `M${f1(x - 3.4 * s)} ${f1(y - 6 * s)}L${f1(x)} ${f1(y - 12.5 * s)}L${f1(x + 3.4 * s)} ${f1(y - 6 * s)}z`;
  };
  const hill = (x: number, y: number, s: number) => {
    L.shadow += ellipse(x + 1 * s, y + 0.8 * s, 11 * s, 2 * s);
    L.hill += `M${f1(x - 10 * s)} ${f1(y)}Q${f1(x - 6 * s)} ${f1(y - 10 * s)} ${f1(x)} ${f1(y - 10 * s)}Q${f1(x + 7 * s)} ${f1(y - 10 * s)} ${f1(x + 11 * s)} ${f1(y)}z`;
    L.hillShade += `M${f1(x + 2 * s)} ${f1(y - 9.8 * s)}Q${f1(x + 9 * s)} ${f1(y - 8 * s)} ${f1(x + 11 * s)} ${f1(y)}L${f1(x + 3 * s)} ${f1(y)}Q${f1(x + 5 * s)} ${f1(y - 5 * s)} ${f1(x + 2 * s)} ${f1(y - 9.8 * s)}z`;
    L.hillHi += `M${f1(x - 8 * s)} ${f1(y - 2 * s)}Q${f1(x - 5.5 * s)} ${f1(y - 8.5 * s)} ${f1(x - 1 * s)} ${f1(y - 9 * s)}Q${f1(x - 5 * s)} ${f1(y - 6 * s)} ${f1(x - 6 * s)} ${f1(y - 2 * s)}z`;
  };
  const rock = (x: number, y: number, s: number) => {
    L.shadow += ellipse(x + 1 * s, y + 0.8 * s, 5 * s, 1.6 * s);
    L.rockD += `M${f1(x - 4.5 * s)} ${f1(y)}L${f1(x - 3.5 * s)} ${f1(y - 4 * s)}L${f1(x)} ${f1(y - 5.5 * s)}L${f1(x + 3.8 * s)} ${f1(y - 3.6 * s)}L${f1(x + 4.8 * s)} ${f1(y)}z`;
    L.rock += `M${f1(x - 3.4 * s)} ${f1(y - 0.8 * s)}L${f1(x - 2.8 * s)} ${f1(y - 3.8 * s)}L${f1(x)} ${f1(y - 4.8 * s)}L${f1(x + 2.4 * s)} ${f1(y - 3.2 * s)}L${f1(x + 1 * s)} ${f1(y - 0.8 * s)}z`;
    L.rockHi += `M${f1(x - 2.4 * s)} ${f1(y - 3.6 * s)}L${f1(x)} ${f1(y - 4.6 * s)}L${f1(x + 1.6 * s)} ${f1(y - 3.4 * s)}L${f1(x - 1 * s)} ${f1(y - 2.6 * s)}z`;
  };
  const sc = hex / 20;
  const detailRng = new Rng((seed ^ 0xd37a11) >>> 0);
  const spots: { x: number; y: number; kind: number; n: number }[] = [];
  for (let i = 0; i < W * H; i++) {
    if (cellTerritory[i] === -1) continue;
    const roll = detailRng.next();
    const jx = (detailRng.next() - 0.5) * hex * 0.8;
    const jy = (detailRng.next() - 0.5) * hex * 0.5;
    const pick = detailRng.next();
    if (roll >= 0.27 || reserved.has(i)) continue;
    const c = i % W;
    const r = Math.floor(i / W);
    const coastal = DIRS.some((d) => {
      const nb = neighbour(i, d, W, H);
      return nb === -1 || cellTerritory[nb] === -1;
    });
    if (coastal && pick > 0.4) continue;
    const kind = coastal ? 3 : pick < 0.5 ? 0 : pick < 0.62 ? 4 : pick < 0.82 ? 1 : 2;
    spots.push({ x: cx(c, r) + jx, y: cy(r) + jy + hex * 0.3, kind, n: 1 + Math.floor(detailRng.next() * 3) });
  }
  spots.sort((a, b) => a.y - b.y);
  for (const s of spots) {
    if (s.kind === 0) {
      tree(s.x, s.y, sc);
      if (s.n > 1) tree(s.x + 7 * sc, s.y + 2.5 * sc, sc * 0.85);
      if (s.n > 2) tree(s.x - 6 * sc, s.y + 3 * sc, sc * 0.9);
    } else if (s.kind === 4) {
      pine(s.x, s.y, sc);
      if (s.n > 1) pine(s.x + 7 * sc, s.y + 2 * sc, sc * 0.85);
      if (s.n > 2) pine(s.x - 6 * sc, s.y + 3 * sc, sc * 0.9);
    } else if (s.kind === 1) hill(s.x, s.y, sc * (0.8 + s.n * 0.12));
    else {
      rock(s.x, s.y, sc);
      if (s.n > 1) rock(s.x + 6 * sc, s.y + 1.5 * sc, sc * 0.7);
    }
  }
  const part = (d: string, fill: string, extra = '') => (d ? `<path d="${d}" fill="${fill}" ${extra}/>` : '');
  ground +=
    part(L.shadow, '#35502a', 'fill-opacity=".28"') +
    part(L.trunk, '#6b4a2e') +
    part(L.pineD, '#3b6b3f') +
    part(L.pine, '#4b8148') +
    part(L.leafD, '#3f7a3f') +
    part(L.leaf, '#58994a') +
    part(L.leafHi, '#8cc065') +
    part(L.hill, '#b3c878') +
    part(L.hillShade, '#8da95e') +
    part(L.hillHi, '#d2dd98') +
    part(L.rockD, '#7f7d73') +
    part(L.rock, '#a9a69a') +
    part(L.rockHi, '#d2cfc0');

  // ---- beach, lake shores and the thin darker shoreline (over the wash) ----
  const over =
    `<g clip-path="url(#${LAND_CLIP_ID})">` +
    `<path d="${landD}" fill="none" stroke="${SAND}" stroke-width="15" stroke-linejoin="round" filter="url(#hd-soft-beach)"/>` +
    `<path d="${lakeD}" fill="none" stroke="${SAND}" stroke-width="10" stroke-linejoin="round" filter="url(#hd-soft-beach)"/>` +
    '</g>' +
    `<path d="${lakeD}" fill="#4e9bbd"/>` +
    `<path d="${lakeD}" fill="none" stroke="#2f7396" stroke-width="3" stroke-opacity=".45" stroke-linejoin="round" filter="url(#hd-soft-beach)"/>` +
    `<path d="${landD}" fill="none" stroke="${SHORE}" stroke-opacity=".75" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<path d="${lakeD}" fill="none" stroke="${SHORE}" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round"/>`;

  const defs =
    `<filter id="hd-soft-sea" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${f1(hex * 0.5)}"/></filter>` +
    `<filter id="hd-soft-surf" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${f1(hex * 0.1)}"/></filter>` +
    `<filter id="hd-soft-land" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${f1(hex * 0.4)}"/></filter>` +
    `<filter id="hd-soft-beach" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${f1(hex * 0.07)}"/></filter>` +
    `<clipPath id="${LAND_CLIP_ID}"><path clip-rule="evenodd" d="${landD}${lakeD}"/></clipPath>` +
    `<clipPath id="${FRAME_CLIP_ID}"><rect x="0" y="0" width="${f1(frameW)}" height="${f1(frameH)}" rx="16"/></clipPath>`;

  return { defs, sea: seaSvg, ground, over, clipD: landD + lakeD };
}
