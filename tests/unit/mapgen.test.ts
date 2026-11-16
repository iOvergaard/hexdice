import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '../../src/engine/config';
import { neighbours } from '../../src/engine/hex';
import { generateMap } from '../../src/engine/mapgen';
import { Rng } from '../../src/engine/rng';

const SEEDS = Array.from({ length: 1000 }, (_, i) => i + 1);
const maps = new Map(SEEDS.map((s) => [s, generateMap(DEFAULT_RULES, new Rng(s))]));
const W = DEFAULT_RULES.gridWidth;
const H = DEFAULT_RULES.gridHeight;

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
