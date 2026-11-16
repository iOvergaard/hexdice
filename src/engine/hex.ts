import type { CellIndex } from './types';

/**
 * Pointy-top hexes in "odd-r" offset layout: odd rows are shifted half a cell right.
 * Directions 0..5 = E, SE, SW, W, NW, NE. The edge facing direction d runs from corner d to corner (d + 1) % 6,
 * where corner i sits at angle 60·i − 30° (screen coordinates, y down).
 */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5;
export const DIRS: readonly Dir[] = [0, 1, 2, 3, 4, 5];

export interface Point {
  x: number;
  y: number;
}

const SQRT3 = Math.sqrt(3);

// [dcol, drow] per direction, for even and odd rows.
const EVEN_ROW: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
const ODD_ROW: readonly (readonly [number, number])[] = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];

export function cellIndex(col: number, row: number, width: number): CellIndex {
  return row * width + col;
}

export function cellCol(cell: CellIndex, width: number): number {
  return cell % width;
}

export function cellRow(cell: CellIndex, width: number): number {
  return Math.floor(cell / width);
}

export function oppositeDir(dir: Dir): Dir {
  return ((dir + 3) % 6) as Dir;
}

/** Neighbouring cell in a direction, or -1 when it falls off the grid. */
export function neighbour(cell: CellIndex, dir: Dir, width: number, height: number): CellIndex {
  const col = cellCol(cell, width);
  const row = cellRow(cell, width);
  const [dc, dr] = (row & 1 ? ODD_ROW : EVEN_ROW)[dir]!;
  const c = col + dc;
  const r = row + dr;
  if (c < 0 || c >= width || r < 0 || r >= height) return -1;
  return cellIndex(c, r, width);
}

/** On-grid neighbours in direction order. */
export function neighbours(cell: CellIndex, width: number, height: number): CellIndex[] {
  const out: CellIndex[] = [];
  for (const d of DIRS) {
    const n = neighbour(cell, d, width, height);
    if (n !== -1) out.push(n);
  }
  return out;
}

/** Steps between two cells on the grid. */
export function hexDistance(a: CellIndex, b: CellIndex, width: number): number {
  const toCube = (cell: CellIndex): [number, number, number] => {
    const col = cellCol(cell, width);
    const row = cellRow(cell, width);
    const x = col - (row - (row & 1)) / 2;
    return [x, -x - row, row];
  };
  const [ax, ay, az] = toCube(a);
  const [bx, by, bz] = toCube(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

/** Pixel centre of a cell for hexes of the given radius (centre to corner). Cell 0's bounding box starts at 0,0. */
export function cellCentre(cell: CellIndex, width: number, size: number): Point {
  const col = cellCol(cell, width);
  const row = cellRow(cell, width);
  return {
    x: size * SQRT3 * (col + 0.5 * (row & 1)) + (size * SQRT3) / 2,
    y: size * 1.5 * row + size,
  };
}

export function cellCorner(centre: Point, size: number, corner: number): Point {
  const angle = (Math.PI / 180) * (60 * corner - 30);
  return { x: centre.x + size * Math.cos(angle), y: centre.y + size * Math.sin(angle) };
}

/** Corner indices of the edge facing a direction. */
export function edgeCorners(dir: Dir): [number, number] {
  return [dir, (dir + 1) % 6];
}

/** Pixel size of the whole grid. */
export function boardPixelSize(width: number, height: number, size: number): { width: number; height: number } {
  return { width: size * SQRT3 * (width + 0.5), height: size * (1.5 * (height - 1) + 2) };
}
