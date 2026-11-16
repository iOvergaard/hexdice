import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../src/engine/config';
import { neighbours } from '../../src/engine/hex';
import { generateMap } from '../../src/engine/mapgen';
import { Rng } from '../../src/engine/rng';

const SEEDS = Array.from({ length: 1000 }, (_, i) => i + 1);
const maps = new Map(SEEDS.map((s) => [s, generateMap(DEFAULT_RULES, new Rng(s))]));
const W = DEFAULT_RULES.gridWidth;
const H = DEFAULT_RULES.gridHeight;

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
      expect(m.territories).toHaveLength(30);
      m.territories.forEach((t, i) => expect(t.id).toBe(i));
    }
  });

  it('territories are contiguous and within size bounds', () => {
    for (const [seed, m] of maps) {
      for (const t of m.territories) {
        expect(t.cells.length, `seed ${seed}`).toBeGreaterThanOrEqual(6);
        expect(t.cells.length, `seed ${seed}`).toBeLessThanOrEqual(40);
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
      expect(land, `seed ${seed}`).toBeGreaterThanOrEqual(0.65);
      expect(land, `seed ${seed}`).toBeLessThanOrEqual(0.75);
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
    expect(m.territories).toHaveLength(30);
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
