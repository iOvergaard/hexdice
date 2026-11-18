import { cellCentre, hexDistance, neighbours } from './hex';
import type { Rng } from './rng';
import type { Board, CellIndex, RulesConfig, Territory } from './types';

export type MapTerritory = Pick<Territory, 'id' | 'cells' | 'neighbours' | 'centre'>;

const MAX_ATTEMPTS = 500;
const SEA_MARGIN = 2;
/** Random spread, in hexes, added to a frontier cell's distance from the seed: enough to keep borders from running straight. */
const GROWTH_NOISE = 1;
const RELAX_PASSES = 2;

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
  // Grow extra land for lakes and rivers so the land ratio still holds once they are carved out.
  const riverCells = rules.riverCount * Math.round((rules.riverLengthMin + rules.riverLengthMax) / 2);
  const landTarget = Math.round(ratio * total) + lakeSizes.reduce((a, b) => a + b, 0) + riverCells;
  const isLand = shapeContinent(W, H, landTarget, nbrs, rng);
  if (!isLand) return null;
  if (!carveLakes(isLand, lakeSizes, nbrs, rng)) return null;
  const carved = carveRivers(isLand, rules, nbrs, W, rng);
  if (!carved) return null;
  const { fords, rivers } = carved;
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

  // Compact territories, so a two-stack dice token fits: each grows towards its seed, then two relaxation passes move every
  // seed to its territory's middle and regrow. Territories with no inner hex fell from 20% to 8% (18-11-2026).
  const cellTerritory = new Array<number>(total).fill(-1);
  const sizes = new Array<number>(territoryCount).fill(0);
  for (let pass = 0; pass <= RELAX_PASSES; pass++) {
    if (pass > 0) recentreSeeds(seeds, cellTerritory, sizes, W);
    growTerritories(seeds, isLand, nbrs, maxTerritoryCells, W, rng, cellTerritory, sizes);
  }

  let claimed = 0;
  for (const s of sizes) {
    if (s < minTerritoryCells || s > maxTerritoryCells) return null;
    claimed += s;
  }
  if (claimed / total < rules.landRatioMin || claimed / total > rules.landRatioMax) return null;
  // A ford no territory grew into would read as water: the river would have no crossing.
  if (fords.some((f) => cellTerritory[f] === -1)) return null;

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
  if (hasNarrowBridge(adj)) return null;

  const territories: MapTerritory[] = cellsOf.map((cells, id) => ({
    id,
    cells,
    neighbours: [...adj[id]!].sort((a, b) => a - b),
    centre: interiorCell(cells, cellTerritory, id, nbrs),
  }));
  return { board: { width: W, height: H, cellTerritory, fords, rivers }, territories };
}

/**
 * Round-robin growth into free land: each pass, every territory under the size cap takes the free frontier cell nearest
 * its seed, give or take GROWTH_NOISE. Fills `cellTerritory` and `sizes` in place.
 */
function growTerritories(
  seeds: CellIndex[],
  isLand: Uint8Array,
  nbrs: CellIndex[][],
  maxCells: number,
  W: number,
  rng: Rng,
  cellTerritory: number[],
  sizes: number[],
): void {
  cellTerritory.fill(-1);
  sizes.fill(0);
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
    for (let t = 0; t < seeds.length; t++) {
      if (sizes[t]! >= maxCells) continue;
      const free = fronts[t]!.filter((c) => cellTerritory[c] === -1);
      fronts[t] = free;
      let pick = -1;
      let best = Infinity;
      for (let j = 0; j < free.length; j++) {
        const score = hexDistance(free[j]!, seeds[t]!, W) + rng.next() * GROWTH_NOISE;
        if (score < best) {
          best = score;
          pick = j;
        }
      }
      if (pick === -1) continue;
      const cell = free[pick]!;
      free[pick] = free[free.length - 1]!;
      free.pop();
      claim(t, cell);
      progress = true;
    }
  }
}

/** Moves each seed to its territory's cell nearest the territory's centroid. */
function recentreSeeds(seeds: CellIndex[], cellTerritory: number[], sizes: number[], W: number): void {
  const sx = new Float64Array(seeds.length);
  const sy = new Float64Array(seeds.length);
  cellTerritory.forEach((t, c) => {
    if (t === -1) return;
    const p = cellCentre(c, W, 1);
    sx[t]! += p.x;
    sy[t]! += p.y;
  });
  const bestD = new Float64Array(seeds.length).fill(Infinity);
  cellTerritory.forEach((t, c) => {
    if (t === -1) return;
    const p = cellCentre(c, W, 1);
    const d = (p.x - sx[t]! / sizes[t]!) ** 2 + (p.y - sy[t]! / sizes[t]!) ** 2;
    if (d < bestD[t]!) {
      bestD[t] = d;
      seeds[t] = c;
    }
  });
}

/**
 * True when removing one territory splits the map into two or more parts bigger than a small peninsula.
 * Such single-territory bridges make endgames drag: two big empires trade one chokepoint forever.
 */
function hasNarrowBridge(adj: Set<number>[]): boolean {
  const count = adj.length;
  for (let cut = 0; cut < count; cut++) {
    const seen = new Uint8Array(count);
    seen[cut] = 1;
    let large = 0;
    for (let start = 0; start < count; start++) {
      if (seen[start]) continue;
      let size = 0;
      const stack = [start];
      seen[start] = 1;
      while (stack.length > 0) {
        size++;
        for (const nb of adj[stack.pop()!]!) {
          if (!seen[nb]) {
            seen[nb] = 1;
            stack.push(nb);
          }
        }
      }
      if (size > 3 && ++large > 1) return true;
    }
  }
  return false;
}

/**
 * Carves rivers: one-cell-wide water lines from the coast towards the interior that never touch lakes, the sea or each
 * other, then turns one cell back into land as a ford. A connected line of water blocks adjacency on a hex grid, so a
 * river is a defensible line crossable only at its ford. Returns fords and river courses, or null to retry the map.
 */
function carveRivers(
  isLand: Uint8Array,
  rules: RulesConfig,
  nbrs: CellIndex[][],
  W: number,
  rng: Rng,
): { fords: CellIndex[]; rivers: CellIndex[][] } | null {
  const total = isLand.length;
  const fords: CellIndex[] = [];
  const rivers: CellIndex[][] = [];
  for (let r = 0; r < rules.riverCount; r++) {
    // Open sea is the water reachable from the grid edge; rivers start on its shore.
    const sea = new Uint8Array(total);
    const stack: CellIndex[] = [];
    for (let c = 0; c < total; c++) {
      if (!isLand[c] && nbrs[c]!.length < 6) {
        sea[c] = 1;
        stack.push(c);
      }
    }
    while (stack.length > 0) {
      for (const n of nbrs[stack.pop()!]!) {
        if (!isLand[n] && !sea[n]) {
          sea[n] = 1;
          stack.push(n);
        }
      }
    }
    // Rivers head for the cell deepest inland.
    const depth = new Int32Array(total).fill(-1);
    const queue: CellIndex[] = [];
    for (let c = 0; c < total; c++) {
      if (!isLand[c]) {
        depth[c] = 0;
        queue.push(c);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      for (const n of nbrs[queue[i]!]!) {
        if (depth[n] === -1) {
          depth[n] = depth[queue[i]!]! + 1;
          queue.push(n);
        }
      }
    }
    let target = 0;
    for (let c = 0; c < total; c++) if (depth[c]! > depth[target]!) target = c;
    const mouths: CellIndex[] = [];
    for (let c = 0; c < total; c++) {
      if (isLand[c] && nbrs[c]!.some((n) => sea[n]) && nbrs[c]!.filter((n) => isLand[n]).length >= 3) mouths.push(c);
    }
    if (mouths.length === 0) return null;

    const length = rules.riverLengthMin + rng.int(rules.riverLengthMax - rules.riverLengthMin + 1);
    let path: CellIndex[] | null = null;
    for (let attempt = 0; attempt < 12 && !path; attempt++) {
      const walk = [rng.pick(mouths)];
      const inPath = new Set(walk);
      while (walk.length < length) {
        const cur = walk[walk.length - 1]!;
        // One cell wide: a step may touch only the cell it comes from, never other water or earlier river cells.
        const options = nbrs[cur]!.filter(
          (n) => isLand[n] && !inPath.has(n) && nbrs[n]!.every((m) => m === cur || (isLand[m] && !inPath.has(m))),
        );
        if (options.length === 0) break;
        let best = options[0]!;
        let bestScore = -Infinity;
        for (const o of options) {
          // Enough noise to meander instead of running straight along a hex row.
          const score = -hexDistance(o, target, W) + rng.next() * 2.6;
          if (score > bestScore) {
            best = o;
            bestScore = score;
          }
        }
        walk.push(best);
        inPath.add(best);
      }
      if (walk.length >= rules.riverLengthMin) path = walk;
    }
    if (!path) return null;
    for (const c of path) isLand[c] = 0;
    rivers.push(path);
    for (let k = 0; k < rules.fordsPerRiver; k++) {
      const mid = Math.round((path.length * (k + 1)) / (rules.fordsPerRiver + 1)) + rng.int(3) - 1;
      const at = Math.min(path.length - 3, Math.max(2, mid));
      isLand[path[at]!] = 1;
      fords.push(path[at]!);
    }
  }
  return { fords, rivers };
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
