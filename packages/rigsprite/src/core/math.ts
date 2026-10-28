/** 2D affine matrix: x' = a·x + c·y + tx, y' = b·x + d·y + ty. */
export type Mat2D = [a: number, b: number, c: number, d: number, tx: number, ty: number];

export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function identity(): Mat2D {
  return [1, 0, 0, 1, 0, 0];
}

/** Applies `n` first, then `m`. */
export function multiply(m: Mat2D, n: Mat2D): Mat2D {
  const [a1, b1, c1, d1, tx1, ty1] = m;
  const [a2, b2, c2, d2, tx2, ty2] = n;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * tx2 + c1 * ty2 + tx1,
    b1 * tx2 + d1 * ty2 + ty1,
  ];
}

export function invert(m: Mat2D): Mat2D {
  const [a, b, c, d, tx, ty] = m;
  const det = a * d - b * c;
  if (det === 0) throw new Error('invert: singular matrix');
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * tx + ic * ty), -(ib * tx + id * ty)];
}

/** T · R · S. Rotation in degrees, positive = clockwise (y-down). */
export function fromTRS(x: number, y: number, rotationDeg: number, scaleX: number, scaleY: number): Mat2D {
  const r = rotationDeg * DEG2RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, x, y];
}

export function applyToPoint(m: Mat2D, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Angle in degrees of the transformed +x axis. */
export function angleOf(m: Mat2D): number {
  return Math.atan2(m[1], m[0]) * RAD2DEG;
}

/** Euclidean distance between two points. */
export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Normalizes an angle in degrees to (-180, 180]. */
export function normalizeAngle(deg: number): number {
  const n = ((((deg + 180) % 360) + 360) % 360) - 180;
  return n === -180 ? 180 : n;
}

/** cos/sin of an angle in degrees; exact (0, ±1) at multiples of 90° so pixel bounds stay whole. */
export function cosSinDeg(deg: number): { cos: number; sin: number } {
  const n = normalizeAngle(deg);
  if (n === 0) return { cos: 1, sin: 0 };
  if (n === 90) return { cos: 0, sin: 1 };
  if (n === 180) return { cos: -1, sin: 0 };
  if (n === -90) return { cos: 0, sin: -1 };
  const r = (n * Math.PI) / 180;
  return { cos: Math.cos(r), sin: Math.sin(r) };
}
