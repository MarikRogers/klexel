import { applyToPoint, clamp, cosSinDeg, dist, invert, type Mat2D, type Vec2 } from '../core/math';

/**
 * World (x, y, depth d) → screen, orthographic orbit camera:
 * 1. orbit projection (yaw G, pitch N): x′ = x·cos G − d·sin G, y′ = y·cos N + (x·sin G + d·cos G)·sin N
 *    (cos G and cos N clamped by axisScale so the view stays invertible);
 * 2. mirror: x′ → −x′;
 * 3. roll by `rotation` (degrees, clockwise positive in y-down) around the world origin;
 * 4. times `zoom`, plus the screen centre and the pan offset `(x, y)`.
 * Depth d > 0 is towards the front camera; with yaw = pitch = 0 the depth has no effect.
 */
export interface ViewTransform {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  /** Orbit yaw around the vertical axis in degrees (positive = camera moves right around the rig). */
  yaw: number;
  /** Orbit pitch around the horizontal axis in degrees, [-90, 90] (positive = camera looks from above). */
  pitch: number;
  /** Mirror at the vertical axis (project setting). */
  mirror: boolean;
  width: number;
  height: number;
}

/** Smallest |cos| of the orbit angles: keeps the view invertible edge-on (yaw or pitch ±90°). */
export const MIN_AXIS_SCALE = 0.05;

/** `cosValue` with its magnitude clamped to at least MIN_AXIS_SCALE (sign(0) = +1). */
export function axisScale(cosValue: number): number {
  if (Math.abs(cosValue) >= MIN_AXIS_SCALE) return cosValue;
  return cosValue < 0 ? -MIN_AXIS_SCALE : MIN_AXIS_SCALE;
}

/** The camera angles of a view: roll, orbit (degrees) and mirror. */
export interface CameraAngles {
  rotation: number;
  yaw: number;
  pitch: number;
  mirror: boolean;
}

interface Orbit {
  /** Clamped cos(yaw), sin(yaw), clamped cos(pitch), sin(pitch). */
  cy: number;
  sy: number;
  cp: number;
  sp: number;
}

function orbitOf(a: Pick<CameraAngles, 'yaw' | 'pitch'>): Orbit {
  const g = cosSinDeg(a.yaw);
  const n = cosSinDeg(a.pitch);
  return { cy: axisScale(g.cos), sy: g.sin, cp: axisScale(n.cos), sp: n.sin };
}

/**
 * Orbit projection plus mirror (steps 1–2 above) of the rig plane (depth 0): a linear map. In the
 * front view it is exactly the identity (or x → −x when mirrored), so the renderer can apply it
 * before roll and zoom without changing a single bit of today's front view.
 */
export function projectionMatrix(a: Pick<CameraAngles, 'yaw' | 'pitch' | 'mirror'>): Mat2D {
  const { cy, sy, cp, sp } = orbitOf(a);
  const m = a.mirror ? -1 : 1;
  return [m * cy, sy * sp, 0, cp, 0, 0];
}

/** Steps 1–2 for the depth axis: the projected offset of a layer at `depth` from depth 0. */
function projectedDepth(a: Pick<CameraAngles, 'yaw' | 'pitch' | 'mirror'>, depth: number): Vec2 {
  const { cy, sy, sp } = orbitOf(a);
  const m = a.mirror ? -1 : 1;
  return { x: m * -depth * sy, y: depth * cy * sp };
}

/** Linear part of the camera without zoom: roll · mirror · orbit projection. */
function cameraLinear(a: CameraAngles): Mat2D {
  const { cos, sin } = cosSinDeg(a.rotation);
  const [pa, pb, pc, pd] = projectionMatrix(a);
  return [cos * pa - sin * pb, sin * pa + cos * pb, cos * pc - sin * pd, sin * pc + cos * pd, 0, 0];
}

/** World (depth 0) → screen: the full affine view map. */
export function viewMatrix(view: ViewTransform): Mat2D {
  const [a, b, c, d] = cameraLinear(view);
  const z = view.zoom;
  return [a * z, b * z, c * z, d * z, view.width / 2 + view.x, view.height / 2 + view.y];
}

/** Screen offset of a layer at `depth` relative to depth 0 (mirrored, rolled and zoomed; no pan). */
export function depthOffset(view: ViewTransform, depth: number): Vec2 {
  const p = projectedDepth(view, depth);
  const { cos, sin } = cosSinDeg(view.rotation);
  return { x: (p.x * cos - p.y * sin) * view.zoom, y: (p.x * sin + p.y * cos) * view.zoom };
}

export function worldToScreen(view: ViewTransform, p: Vec2, depth = 0): Vec2 {
  const s = applyToPoint(viewMatrix(view), p);
  if (depth === 0) return s;
  const o = depthOffset(view, depth);
  return { x: s.x + o.x, y: s.y + o.y };
}

export function screenToWorld(view: ViewTransform, p: Vec2, depth = 0): Vec2 {
  const o = depth === 0 ? { x: 0, y: 0 } : depthOffset(view, depth);
  return applyToPoint(invert(viewMatrix(view)), { x: p.x - o.x, y: p.y - o.y });
}

/** The camera looks at the back of the rig plane (clamped cos(yaw) < 0); the mirror does not count. */
export function isBackView(view: Pick<CameraAngles, 'yaw'>): boolean {
  return axisScale(cosSinDeg(view.yaw).cos) < 0;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 16;

/**
 * Two-finger gesture: zoom by the change in finger distance (clamped to [MIN_ZOOM, MAX_ZOOM]; a zero
 * distance keeps the zoom) and pan so the world point under the old midpoint ends up under the new one.
 * The rotation is never changed.
 */
export function pinchView(view: ViewTransform, prev: [Vec2, Vec2], next: [Vec2, Vec2]): ViewTransform {
  const d0 = dist(prev[0], prev[1]);
  const d1 = dist(next[0], next[1]);
  const zoom = d0 > 0 && d1 > 0 ? clamp((view.zoom * d1) / d0, MIN_ZOOM, MAX_ZOOM) : view.zoom;
  const m0 = { x: (prev[0].x + prev[1].x) / 2, y: (prev[0].y + prev[1].y) / 2 };
  const m1 = { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 };
  const w = screenToWorld(view, m0);
  const unpanned = worldToScreen({ ...view, x: 0, y: 0, zoom }, w);
  return { ...view, x: m1.x - unpanned.x, y: m1.y - unpanned.y, zoom };
}

/**
 * Pan offset after turning the camera by `deltaDeg` around the viewport centre: the world point under
 * the centre stays put, so the pan offset is rotated by the same angle. Other fields are kept.
 */
export function rotatePanAroundCenter<V extends { x: number; y: number }>(view: V, deltaDeg: number): V {
  const { cos, sin } = cosSinDeg(deltaDeg);
  return { ...view, x: view.x * cos - view.y * sin, y: view.x * sin + view.y * cos };
}

/**
 * Pan offset after the camera angles change from `from` to `to` (roll, orbit and / or mirror): the
 * world point (depth 0) under the viewport centre stays put. `pan' = L(to) · L(from)⁻¹ · pan` with
 * L = roll · mirror · orbit projection (the zoom cancels). Other fields are kept.
 */
export function followCameraPan<V extends { x: number; y: number }>(view: V, from: CameraAngles, to: CameraAngles): V {
  const p = applyToPoint(invert(cameraLinear(from)), view);
  const q = applyToPoint(cameraLinear(to), p);
  return { ...view, x: q.x, y: q.y };
}
