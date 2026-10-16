export type Point = [number, number];

function box(x0: number, y0: number, x1: number, y1: number) {
  return { l: Math.min(x0, x1), r: Math.max(x0, x1), t: Math.min(y0, y1), b: Math.max(y0, y1) };
}

/** Rechteck in der Ziehbox (beide Ecken inklusive), ohne doppelte Punkte. */
export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const { l, r, t, b } = box(x0, y0, x1, y1);
  const pts: Point[] = [];
  for (let y = t; y <= b; y++) {
    const edgeRow = y === t || y === b;
    for (let x = l; x <= r; x++) {
      if (filled || edgeRow || x === l || x === r) pts.push([x, y]);
    }
  }
  return pts;
}

/**
 * Ellipse, die die Ziehbox (beide Ecken inklusive) ausfüllt. Ein Pixel gehört dazu, wenn
 * sein Mittelpunkt in der Ellipse liegt; der Umriss sind die Pixel mit einem Nachbarn außerhalb.
 * Ergebnis ist achsensymmetrisch und liegt vollständig in der Box.
 */
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const { l, r, t, b } = box(x0, y0, x1, y1);
  const cx = (l + r) / 2, cy = (t + b) / 2;
  const a = (r - l + 1) / 2, bb = (b - t + 1) / 2;
  const inside = (x: number, y: number) => ((x - cx) / a) ** 2 + ((y - cy) / bb) ** 2 <= 1;
  const pts: Point[] = [];
  for (let y = t; y <= b; y++) {
    for (let x = l; x <= r; x++) {
      if (!inside(x, y)) continue;
      if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) pts.push([x, y]);
    }
  }
  return pts;
}
