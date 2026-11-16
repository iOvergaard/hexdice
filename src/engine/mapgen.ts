import { hexDistance, neighbours } from './hex';
import type { Rng } from './rng';
import type { Board, CellIndex, RulesConfig, Territory } from './types';

export type MapTerritory = Pick<Territory, 'id' | 'cells' | 'neighbours' | 'centre'>;

const MAX_ATTEMPTS = 500;

/**
 * Grows a ragged land blob, spreads seeds over it (best-of-k farthest point), grows territories round-robin
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

  // Land blob: random frontier growth, biased towards cells with many land neighbours (compact, ragged coast).
  const span = rules.landRatioMax - rules.landRatioMin;
  const ratio = rules.landRatioMin + span * 0.25 + rng.next() * span * 0.5;
  const landTarget = Math.round(ratio * total);
  const isLand = new Uint8Array(total);
  const start = (Math.floor(H / 2) + rng.int(5) - 2) * W + Math.floor(W / 2) + rng.int(5) - 2;
  const frontier: CellIndex[] = [start];
  const inFrontier = new Uint8Array(total);
  inFrontier[start] = 1;
  const score = (c: CellIndex) => nbrs[c]!.filter((n) => isLand[n]).length;
  let landCount = 0;
  while (landCount < landTarget && frontier.length > 0) {
    let pick = rng.int(frontier.length);
    for (let k = 0; k < 2; k++) {
      const other = rng.int(frontier.length);
      if (score(frontier[other]!) > score(frontier[pick]!)) pick = other;
    }
    const cell = frontier[pick]!;
    frontier[pick] = frontier[frontier.length - 1]!;
    frontier.pop();
    isLand[cell] = 1;
    landCount++;
    for (const n of nbrs[cell]!) {
      if (!isLand[n] && !inFrontier[n]) {
        inFrontier[n] = 1;
        frontier.push(n);
      }
    }
  }
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
