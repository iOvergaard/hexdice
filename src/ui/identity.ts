/** Eight fills that differ in lightness as well as hue, tuned to read as a wash on meadow green and as dice on ink. */
export const PALETTE: readonly string[] = [
  '#f5b82e', // amber
  '#e5472d', // vermilion
  '#2fc4d9', // cyan
  '#9065f0', // violet
  '#f4f0dc', // ivory
  '#f06aa8', // rose
  '#2b63d9', // royal blue
  '#8a5532', // umber
];

export const EMBLEM_NAMES: readonly string[] = ['circle', 'square', 'triangle', 'diamond', 'cross', 'hexagon', 'star', 'chevron'];

export function playerColour(identity: number): string {
  return PALETTE[((identity % 8) + 8) % 8]!;
}

const f = (n: number) => Math.round(n * 100) / 100;

function polygon(points: Array<[number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join(' ') + ' Z';
}

function regular(sides: number, r: number, rotate: number): string {
  return polygon(
    Array.from({ length: sides }, (_, i): [number, number] => {
      const a = rotate + (i * 2 * Math.PI) / sides;
      return [r * Math.cos(a), r * Math.sin(a)];
    }),
  );
}

/** Filled SVG path for an emblem, centred on 0,0 and fitting a circle of radius `size`. */
export function emblemPath(identity: number, size: number): string {
  const s = size;
  switch (((identity % 8) + 8) % 8) {
    case 0:
      // Polygon, not two 180° arcs: those resolve ambiguously and render as a half circle.
      return regular(32, s, 0);
    case 1: {
      const h = s * 0.82;
      return polygon([[-h, -h], [h, -h], [h, h], [-h, h]]);
    }
    case 2:
      return regular(3, s * 1.1, -Math.PI / 2);
    case 3:
      return polygon([[0, -s * 1.1], [s * 0.85, 0], [0, s * 1.1], [-s * 0.85, 0]]);
    case 4: {
      const a = s;
      const b = s * 0.36;
      return polygon([[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]]);
    }
    case 5:
      return regular(6, s, 0);
    case 6:
      return polygon(
        Array.from({ length: 10 }, (_, i): [number, number] => {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 === 0 ? s * 1.1 : s * 0.46;
          return [r * Math.cos(a), r * Math.sin(a)];
        }),
      );
    default:
      return polygon([[-s, s * 0.2], [0, -s * 0.8], [s, s * 0.2], [s, s * 0.85], [0, s * 0.0], [-s, s * 0.85]]);
  }
}

/** Owner colour mixed towards black, for borders and die edges. */
export function darken(hex: string, amount = 0.45): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((v >> shift) & 255) * (1 - amount));
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
}

/** Pip colour that reads on top of the given owner colour. */
export function pipColour(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.55 ? '#1b1a2e' : '#ffffff';
}
