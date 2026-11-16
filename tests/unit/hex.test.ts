import { describe, expect, it } from 'vitest';
import {
  DIRS,
  cellCentre,
  cellCorner,
  cellIndex,
  edgeCorners,
  hexDistance,
  neighbour,
  neighbours,
  oppositeDir,
} from '../../src/engine/hex';

const W = 32;
const H = 24;
const SIZE = 10;

describe('hex grid', () => {
  it('neighbour relation is symmetric through the opposite direction', () => {
    for (let cell = 0; cell < W * H; cell++) {
      for (const d of DIRS) {
        const n = neighbour(cell, d, W, H);
        if (n !== -1) expect(neighbour(n, oppositeDir(d), W, H)).toBe(cell);
      }
    }
  });

  it('has 6 neighbours inside the grid and fewer at the corners', () => {
    expect(neighbours(cellIndex(5, 5, W), W, H)).toHaveLength(6);
    expect(neighbours(cellIndex(0, 0, W), W, H)).toHaveLength(2);
    expect(neighbours(cellIndex(W - 1, 1, W), W, H)).toHaveLength(3);
    expect(neighbours(cellIndex(W - 1, H - 1, W), W, H)).toHaveLength(2);
  });

  it('neighbours are at distance 1', () => {
    for (const cell of [0, 33, 100, 401, W * H - 1]) {
      for (const n of neighbours(cell, W, H)) expect(hexDistance(cell, n, W)).toBe(1);
    }
    expect(hexDistance(cellIndex(0, 0, W), cellIndex(4, 0, W), W)).toBe(4);
  });

  it('shared edges line up between neighbouring cells', () => {
    const close = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
    for (const cell of [cellIndex(4, 4, W), cellIndex(7, 5, W)]) {
      const c = cellCentre(cell, W, SIZE);
      for (const d of DIRS) {
        const n = neighbour(cell, d, W, H);
        const nc = cellCentre(n, W, SIZE);
        const [a0, a1] = edgeCorners(d).map((i) => cellCorner(c, SIZE, i));
        const [b0, b1] = edgeCorners(oppositeDir(d)).map((i) => cellCorner(nc, SIZE, i));
        expect(close(a0!, b1!) && close(a1!, b0!)).toBe(true);
      }
    }
  });
});
