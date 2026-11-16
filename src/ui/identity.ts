/** Eight fills that differ in lightness as well as hue, so they stay apart for most colour-vision types. */
export const PALETTE: readonly string[] = [
  '#f4b73f', // amber
  '#e8603c', // vermilion
  '#3fc7b8', // teal
  '#9b7cf2', // violet
  '#b4d94a', // lime
  '#f08fb8', // rose
  '#4c9ff0', // sky
  '#a0714f', // umber
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
