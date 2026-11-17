import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../src/engine/config';
import { neighbours } from '../../src/engine/hex';
import { generateMap } from '../../src/engine/mapgen';
import { Rng } from '../../src/engine/rng';

const SEEDS = Array.from({ length: 1000 }, (_, i) => i + 1);
const maps = new Map(SEEDS.map((s) => [s, generateMap(DEFAULT_RULES, new Rng(s))]));
const W = DEFAULT_RULES.gridWidth;
const H = DEFAULT_RULES.gridHeight;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const isEdge = (c: number) => c % W === 0 || c % W === W - 1 || c < W || c >= W * (H - 1);

/** Coastline edges (land side facing water or the grid border, lakes included) divided by sqrt(land cells). */
function irregularity(cellTerritory: number[]): number {
  let land = 0;
  let coast = 0;
  cellTerritory.forEach((t, c) => {
    if (t === -1) return;
    land++;
    coast += 6 - neighbours(c, W, H).filter((n) => cellTerritory[n] !== -1).length;
  });
  return coast / Math.sqrt(land);
}

/** Median irregularity of the old blob generator (32x24, 65-75% land) over seeds 1..1000. */
const BASELINE_IRREGULARITY = 11.57;

/** Water cells not connected to the grid edge, grouped into lakes. */
function lakes(cellTerritory: number[]): number[][] {
  const water = (c: number) => cellTerritory[c] === -1;
  const outer = new Set<number>();
  const stack: number[] = [];
  for (let c = 0; c < W * H; c++) {
    const col = c % W;
    const row = Math.floor(c / W);
    if (water(c) && (col === 0 || row === 0 || col === W - 1 || row === H - 1)) {
      outer.add(c);
      stack.push(c);
    }
  }
  while (stack.length) {
    for (const n of neighbours(stack.pop()!, W, H)) {
      if (water(n) && !outer.has(n)) {
        outer.add(n);
        stack.push(n);
      }
    }
  }
  const seen = new Set<number>();
  const result: number[][] = [];
  for (let c = 0; c < W * H; c++) {
    if (!water(c) || outer.has(c) || seen.has(c)) continue;
    const lake = [c];
    seen.add(c);
    for (let i = 0; i < lake.length; i++) {
      for (const n of neighbours(lake[i]!, W, H)) {
        if (water(n) && !outer.has(n) && !seen.has(n)) {
          seen.add(n);
          lake.push(n);
        }
      }
    }
    result.push(lake);
  }
  return result;
}


/** Territory pairs that face each other across one water cell but don't touch: what water actually blocks. */
function acrossWaterPairs(m: ReturnType<typeof generateMap>): number {
  const ct = m.board.cellTerritory;
  const pairs = new Set<string>();
  for (let c = 0; c < ct.length; c++) {
    if (ct[c] !== -1) continue;
    const shores = [...new Set(neighbours(c, W, H).map((n) => ct[n]!).filter((t) => t >= 0))];
    for (let i = 0; i < shores.length; i++) {
      for (let j = i + 1; j < shores.length; j++) {
        const [a, b] = [shores[i]!, shores[j]!].sort((x, y) => x - y);
        if (!m.territories[a!]!.neighbours.includes(b!)) pairs.add(`${a}-${b}`);
      }
    }
  }
  return pairs.size;
}

describe('generateMap', () => {
  it('generates exactly territoryCount territories', () => {
    for (const [, m] of maps) {
      expect(m.territories).toHaveLength(DEFAULT_RULES.territoryCount);
      m.territories.forEach((t, i) => expect(t.id).toBe(i));
    }
  });

  it('territories are contiguous and within size bounds', () => {
    for (const [seed, m] of maps) {
      for (const t of m.territories) {
        expect(t.cells.length, `seed ${seed}`).toBeGreaterThanOrEqual(DEFAULT_RULES.minTerritoryCells);
        expect(t.cells.length, `seed ${seed}`).toBeLessThanOrEqual(DEFAULT_RULES.maxTerritoryCells);
        expect(t.cells).toEqual([...t.cells].sort((a, b) => a - b));
        const inside = new Set(t.cells);
        const seen = new Set([t.cells[0]!]);
        const stack = [t.cells[0]!];
        while (stack.length) {
          for (const n of neighbours(stack.pop()!, W, H)) {
            if (inside.has(n) && !seen.has(n)) {
              seen.add(n);
              stack.push(n);
            }
          }
        }
        expect(seen.size, `seed ${seed} territory ${t.id}`).toBe(t.cells.length);
      }
    }
  });

  it('land ratio is within bounds', () => {
    for (const [seed, m] of maps) {
      const land = m.board.cellTerritory.filter((t) => t !== -1).length / (W * H);
      expect(land, `seed ${seed}`).toBeGreaterThanOrEqual(DEFAULT_RULES.landRatioMin);
      expect(land, `seed ${seed}`).toBeLessThanOrEqual(DEFAULT_RULES.landRatioMax);
    }
  });

  it('board and territories agree', () => {
    for (const [seed, m] of maps) {
      expect(m.board.width).toBe(W);
      expect(m.board.height).toBe(H);
      expect(m.board.cellTerritory).toHaveLength(W * H);
      // Count mismatches, then assert once: a per-cell expect over 1,000 maps is ~1.5M assertions and times out on CI.
      const owner = new Map<number, number>();
      let duplicates = 0;
      for (const t of m.territories) {
        for (const c of t.cells) {
          if (owner.has(c)) duplicates++;
          owner.set(c, t.id);
        }
      }
      const mismatched = m.board.cellTerritory.filter((t, cell) => t !== (owner.get(cell) ?? -1)).length;
      expect({ duplicates, mismatched }, `seed ${seed}`).toEqual({ duplicates: 0, mismatched: 0 });
    }
  });

  it('adjacency matches shared edges', () => {
    for (const [seed, m] of maps) {
      const expected = m.territories.map(() => new Set<number>());
      m.board.cellTerritory.forEach((t, cell) => {
        if (t === -1) return;
        for (const n of neighbours(cell, W, H)) {
          const u = m.board.cellTerritory[n]!;
          if (u !== -1 && u !== t) expected[t]!.add(u);
        }
      });
      const wrong = m.territories.filter((t, i) => t.neighbours.join() !== [...expected[i]!].sort((a, b) => a - b).join()).map((t) => t.id);
      const asymmetric = m.territories.filter((t, i) => t.neighbours.some((n) => !m.territories[n]!.neighbours.includes(i))).map((t) => t.id);
      expect({ wrong, asymmetric }, `seed ${seed}`).toEqual({ wrong: [], asymmetric: [] });
    }
  });

  it('territory graph is connected', () => {
    for (const [seed, m] of maps) {
      const seen = new Set([0]);
      const stack = [0];
      while (stack.length) {
        for (const n of m.territories[stack.pop()!]!.neighbours) {
          if (!seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
      expect(seen.size, `seed ${seed}`).toBe(m.territories.length);
    }
  });

  it('centre is an interior cell when one exists', () => {
    for (const [, m] of maps) {
      for (const t of m.territories) {
        expect(t.cells).toContain(t.centre);
        const inside = new Set(t.cells);
        const interior = (c: number) => {
          const ns = neighbours(c, W, H);
          return ns.length === 6 && ns.every((n) => inside.has(n));
        };
        if (t.cells.some(interior)) expect(interior(t.centre)).toBe(true);
      }
    }
  });

  it('has inland lakes', () => {
    const { lakeCount, lakeSizeMin } = DEFAULT_RULES;
    for (const [seed, m] of maps) {
      const found = lakes(m.board.cellTerritory);
      expect(found.some((l) => l.length >= lakeSizeMin), `seed ${seed}`).toBe(true);
      expect(found.flat().length, `seed ${seed}`).toBeGreaterThanOrEqual(lakeCount * lakeSizeMin);
    }
  });

  it('can generate without lakes', () => {
    const m = generateMap({ ...DEFAULT_RULES, lakeCount: 0 }, new Rng(3));
    expect(m.territories).toHaveLength(DEFAULT_RULES.territoryCount);
  });

  it('leaves open sea around the continent', () => {
    const shares = [...maps.values()].map((m) => {
      let edge = 0;
      let edgeLand = 0;
      m.board.cellTerritory.forEach((t, c) => {
        if (!isEdge(c)) return;
        edge++;
        if (t !== -1) edgeLand++;
      });
      return edgeLand / edge;
    });
    expect(median(shares)).toBeLessThanOrEqual(0.1);
  });

  it('has a coastline at least 25% more irregular than the old blob', () => {
    const med = median([...maps.values()].map((m) => irregularity(m.board.cellTerritory)));
    expect(med).toBeGreaterThanOrEqual(BASELINE_IRREGULARITY * 1.25);
  });

  it('keeps territories around 15 to 20 cells on average', () => {
    const avg = median([...maps.values()].map((m) => m.board.cellTerritory.filter((t) => t !== -1).length / m.territories.length));
    expect(avg).toBeGreaterThanOrEqual(15);
    expect(avg).toBeLessThanOrEqual(20);
  });

  it('has no single-territory bridge between large regions', () => {
    for (const [seed, m] of maps) {
      for (let cut = 0; cut < m.territories.length; cut++) {
        const seen = new Set([cut]);
        const sizes: number[] = [];
        for (const start of m.territories) {
          if (seen.has(start.id)) continue;
          let size = 0;
          const stack = [start.id];
          seen.add(start.id);
          while (stack.length) {
            size++;
            for (const nb of m.territories[stack.pop()!]!.neighbours) {
              if (!seen.has(nb)) {
                seen.add(nb);
                stack.push(nb);
              }
            }
          }
          sizes.push(size);
        }
        expect(sizes.filter((s) => s > 3).length, `seed ${seed} cut ${cut}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rivers keep a ford of land, with water on both sides', () => {
    for (const [seed, m] of maps) {
      const fords = m.board.fords ?? [];
      expect(fords.length, `seed ${seed}`).toBe(DEFAULT_RULES.riverCount * DEFAULT_RULES.fordsPerRiver);
      for (const f of fords) {
        expect(m.board.cellTerritory[f], `seed ${seed} ford ${f}`).not.toBe(-1);
        const water = neighbours(f, W, H).filter((n) => m.board.cellTerritory[n] === -1);
        const opposite = water.some((a) => water.some((b) => a !== b && !neighbours(a, W, H).includes(b)));
        expect(opposite, `seed ${seed} ford ${f}`).toBe(true);
      }
    }
  });

  it('rivers separate at least twice as many territory pairs as lakes alone', () => {
    const seeds = SEEDS.slice(0, 200);
    const withRivers = seeds.reduce((sum, s) => sum + acrossWaterPairs(maps.get(s)!), 0);
    const lakesOnly = seeds.reduce((sum, s) => sum + acrossWaterPairs(generateMap({ ...DEFAULT_RULES, riverCount: 0 }, new Rng(s))), 0);
    expect(withRivers / lakesOnly).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic', () => {
    expect(generateMap(DEFAULT_RULES, new Rng(5))).toEqual(generateMap(DEFAULT_RULES, new Rng(5)));
    expect(generateMap(DEFAULT_RULES, new Rng(1))).not.toEqual(generateMap(DEFAULT_RULES, new Rng(2)));
  });

  it('is fast enough', () => {
    const start = performance.now();
    for (let s = 5000; s < 5200; s++) generateMap(DEFAULT_RULES, new Rng(s));
    expect(performance.now() - start).toBeLessThan(10_000);
  });
});
