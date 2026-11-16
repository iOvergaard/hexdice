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
    for (const [, m] of maps) {
      expect(m.board.width).toBe(W);
      expect(m.board.height).toBe(H);
      expect(m.board.cellTerritory).toHaveLength(W * H);
      const owner = new Map<number, number>();
      for (const t of m.territories) {
        for (const c of t.cells) {
          expect(owner.has(c)).toBe(false);
          owner.set(c, t.id);
        }
      }
      m.board.cellTerritory.forEach((t, cell) => expect(t).toBe(owner.get(cell) ?? -1));
    }
  });

  it('adjacency matches shared edges', () => {
    for (const [, m] of maps) {
      const expected = m.territories.map(() => new Set<number>());
      m.board.cellTerritory.forEach((t, cell) => {
        if (t === -1) return;
        for (const n of neighbours(cell, W, H)) {
          const u = m.board.cellTerritory[n]!;
          if (u !== -1 && u !== t) expected[t]!.add(u);
        }
      });
      m.territories.forEach((t, i) => {
        expect(t.neighbours).toEqual([...expected[i]!].sort((a, b) => a - b));
        for (const n of t.neighbours) expect(m.territories[n]!.neighbours).toContain(i);
      });
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
