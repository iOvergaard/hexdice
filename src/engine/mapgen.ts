import { hexDistance, neighbours } from './hex';
import type { Rng } from './rng';
import type { Board, CellIndex, RulesConfig, Territory } from './types';

export type MapTerritory = Pick<Territory, 'id' | 'cells' | 'neighbours' | 'centre'>;

const MAX_ATTEMPTS = 500;
const SEA_MARGIN = 2;

/**
 * Shapes one continent from a lobed, bay-notched radial mask inside a sea margin, spreads seeds over it (best-of-k farthest point), grows territories round-robin
 * into free land, then validates. A failed draw is retried on the same rng, so output stays deterministic.
 */
export function generateMap(rules: RulesConfig, rng: Rng): { board: Board; territories: MapTerritory[] } {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = tryGenerate(rules, rng);
    if (result) return result;
  }
  throw new Error('generateMap: no valid map found for these rules');
}

function tryGenerate(rules: RulesConfig, rng: Rng): { board: Board; territories: MapTerritory[] } | null {
  const { gridWidth: W, gridHeight: H, territoryCount, minTerritoryCells, maxTerritoryCells } = rules;
  const total = W * H;
  const nbrs: CellIndex[][] = Array.from({ length: total }, (_, c) => neighbours(c, W, H));

  const span = rules.landRatioMax - rules.landRatioMin;
  const ratio = rules.landRatioMin + span * 0.25 + rng.next() * span * 0.5;
  const lakeSizes = Array.from({ length: rules.lakeCount }, () => rules.lakeSizeMin + rng.int(rules.lakeSizeMax - rules.lakeSizeMin + 1));
  // Grow extra land for the lakes so the land ratio still holds once they are carved out.
  const landTarget = Math.round(ratio * total) + lakeSizes.reduce((a, b) => a + b, 0);
  const isLand = shapeContinent(W, H, landTarget, nbrs, rng);
  if (!isLand) return null;
  if (!carveLakes(isLand, lakeSizes, nbrs, rng)) return null;
  const land: CellIndex[] = [];
  for (let c = 0; c < total; c++) if (isLand[c]) land.push(c);
  if (land.length < territoryCount * minTerritoryCells) return null;

  // Seeds spread apart.
  const seeds: CellIndex[] = [rng.pick(land)];
  while (seeds.length < territoryCount) {
    let best = -1;
    let bestDist = -1;
    for (let k = 0; k < 8; k++) {
      const cand = rng.pick(land);
      let d = Infinity;
      for (const s of seeds) d = Math.min(d, hexDistance(cand, s, W));
      if (d > bestDist) {
        best = cand;
        bestDist = d;
      }
    }
    if (bestDist >= 1) seeds.push(best);
  }

  // Round-robin growth, one random frontier cell per territory per pass.
  const cellTerritory = new Array<number>(total).fill(-1);
  const sizes = new Array<number>(territoryCount).fill(0);
  const fronts: CellIndex[][] = seeds.map(() => []);
  const claim = (t: number, cell: CellIndex) => {
    cellTerritory[cell] = t;
    sizes[t]!++;
    for (const n of nbrs[cell]!) if (isLand[n] && cellTerritory[n] === -1) fronts[t]!.push(n);
  };
  seeds.forEach((cell, t) => claim(t, cell));
  let progress = true;
  while (progress) {
    progress = false;
    for (let t = 0; t < territoryCount; t++) {
      if (sizes[t]! >= maxTerritoryCells) continue;
      const f = fronts[t]!;
      while (f.length > 0) {
        const i = rng.int(f.length);
        const cell = f[i]!;
        f[i] = f[f.length - 1]!;
        f.pop();
        if (cellTerritory[cell] === -1) {
          claim(t, cell);
          progress = true;
          break;
        }
      }
    }
  }

  let claimed = 0;
  for (const s of sizes) {
    if (s < minTerritoryCells || s > maxTerritoryCells) return null;
    claimed += s;
  }
  if (claimed / total < rules.landRatioMin || claimed / total > rules.landRatioMax) return null;

  const cellsOf: CellIndex[][] = seeds.map(() => []);
  const adj: Set<number>[] = seeds.map(() => new Set<number>());
  for (let c = 0; c < total; c++) {
    const t = cellTerritory[c]!;
    if (t === -1) continue;
    cellsOf[t]!.push(c);
    for (const n of nbrs[c]!) {
      const u = cellTerritory[n]!;
      if (u !== -1 && u !== t) adj[t]!.add(u);
    }
  }

  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    for (const n of adj[stack.pop()!]!) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  if (seen.size !== territoryCount) return null;

  const territories: MapTerritory[] = cellsOf.map((cells, id) => ({
    id,
    cells,
    neighbours: [...adj[id]!].sort((a, b) => a - b),
    centre: interiorCell(cells, cellTerritory, id, nbrs),
  }));
  return { board: { width: W, height: H, cellTerritory }, territories };
}

/** Turns interior land into lakes. Lake cells stay at least one land cell away from the open sea. */
function carveLakes(isLand: Uint8Array, sizes: number[], nbrs: CellIndex[][], rng: Rng): boolean {
  const total = isLand.length;
  // Distance to water, with the grid edge counting as water. Water first, then edge land, keeps the BFS ordered.
  const dist = new Int32Array(total).fill(-1);
  const queue: CellIndex[] = [];
  for (let c = 0; c < total; c++) {
    if (!isLand[c]) {
      dist[c] = 0;
      queue.push(c);
    }
  }
  for (let c = 0; c < total; c++) {
    if (isLand[c] && nbrs[c]!.length < 6) {
      dist[c] = 1;
      queue.push(c);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    for (const n of nbrs[c]!) {
      if (dist[n] === -1) {
        dist[n] = dist[c]! + 1;
        queue.push(n);
      }
    }
  }

  for (const size of sizes) {
    const candidates: CellIndex[] = [];
    for (let c = 0; c < total; c++) if (isLand[c] && dist[c]! >= 3) candidates.push(c);
    if (candidates.length === 0) return false;
    const first = rng.pick(candidates);
    isLand[first] = 0;
    let carved = 1;
    const frontier = [...nbrs[first]!];
    while (carved < size && frontier.length > 0) {
      const i = rng.int(frontier.length);
      const c = frontier[i]!;
      frontier[i] = frontier[frontier.length - 1]!;
      frontier.pop();
      if (!isLand[c] || dist[c]! < 2) continue;
      isLand[c] = 0;
      carved++;
      frontier.push(...nbrs[c]!);
    }
  }
  return true;
}

/** Cell deepest inside the territory (BFS from its border), ties to the lowest index. */
function interiorCell(cells: CellIndex[], cellTerritory: number[], id: number, nbrs: CellIndex[][]): CellIndex {
  const depth = new Map<CellIndex, number>();
  let queue: CellIndex[] = [];
  for (const c of cells) {
    if (nbrs[c]!.length < 6 || nbrs[c]!.some((n) => cellTerritory[n] !== id)) {
      depth.set(c, 1);
      queue.push(c);
    }
  }
  while (queue.length) {
    const next: CellIndex[] = [];
    for (const c of queue) {
      for (const n of nbrs[c]!) {
        if (cellTerritory[n] === id && !depth.has(n)) {
          depth.set(n, depth.get(c)! + 1);
          next.push(n);
        }
      }
    }
    queue = next;
  }
  let best = cells[0]!;
  for (const c of cells) if ((depth.get(c) ?? 0) > (depth.get(best) ?? 0)) best = c;
  return best;
}

/**
 * Land mask: an ellipse whose radius varies with the angle (low-frequency lobes, bumps for peninsulas, dips for bays),
 * scaled to hit `target` cells, then reduced to the component around the centre so the landmass is one piece.
 */
function shapeContinent(W: number, H: number, target: number, nbrs: CellIndex[][], rng: Rng): Uint8Array | null {
  const total = W * H;
  const ROW = Math.sqrt(3) / 2;
  const cx = W / 2;
  const cy = (H * ROW) / 2;
  const rx = W / 2 - SEA_MARGIN;
  const ry = (H * ROW) / 2 - SEA_MARGIN * ROW;
  const lobes: [number, number, number][] = [];
  for (let k = 2; k <= 8; k++) lobes.push([k, (0.4 / (k - 1) ** 0.6) * (0.5 + rng.next()), rng.next() * Math.PI * 2]);
  const features: [number, number, number][] = []; // [angle, signed height, width]
  const bays = 4 + rng.int(3);
  const capes = 4 + rng.int(3);
  for (let i = 0; i < bays; i++) features.push([rng.next() * Math.PI * 2, -(0.4 + rng.next() * 0.35), 0.15 + rng.next() * 0.2]);
  for (let i = 0; i < capes; i++) features.push([rng.next() * Math.PI * 2, 0.3 + rng.next() * 0.3, 0.14 + rng.next() * 0.14]);
  const radius = (a: number) => {
    let f = 1;
    for (const [k, amp, ph] of lobes) f += amp * Math.cos(k * a + ph);
    for (const [centre, h, w] of features) {
      let d = Math.abs(a - centre) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      f += h * Math.exp(-((d / w) ** 2));
    }
    return Math.max(0.3, f);
  };
  const norm = new Float64Array(total); // distance relative to the radius at this angle
  let fMax = 0;
  for (let c = 0; c < total; c++) {
    const x = ((c % W) + (Math.floor(c / W) % 2 ? 0.5 : 0) - cx) / rx;
    const y = (Math.floor(c / W) * ROW - cy) / ry;
    const f = radius(Math.atan2(y, x));
    fMax = Math.max(fMax, f);
    norm[c] = Math.hypot(x, y) / f + (rng.next() - 0.5) * 0.04;
  }
  const cut = (s: number) => {
    let n = 0;
    for (let c = 0; c < total; c++) if (norm[c]! <= s) n++;
    return n;
  };
  let lo = 0;
  let hi = 1 / 1; // hi = 1: the mask hits the sea margin at the widest lobe only when f is 1; guarded below
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (cut(mid) < target) lo = mid;
    else hi = mid;
  }
  const isLand = new Uint8Array(total);
  const root = Math.floor(H / 2) * W + Math.floor(W / 2);
  if (norm[root]! > hi) return null;
  isLand[root] = 1;
  const stack = [root];
  while (stack.length) {
    for (const n of nbrs[stack.pop()!]!) {
      if (!isLand[n] && norm[n]! <= hi && nbrs[n]!.length === 6) {
        isLand[n] = 1;
        stack.push(n);
      }
    }
  }
  return isLand;
}
