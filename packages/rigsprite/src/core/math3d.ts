import { MAX_DEPTH_ANGLE_DEG } from './defaults';
import { clamp, cosSinDeg, DEG2RAD, type Mat2D } from './math';

/**
 * 3D affine matrix as the images of the x, y and z axes followed by the translation:
 * p' = xAxis·p.x + yAxis·p.y + zAxis·p.z + t. The z axis points towards the front camera.
 */
export type Mat3D = [
  xx: number,
  xy: number,
  xz: number,
  yx: number,
  yy: number,
  yz: number,
  zx: number,
  zy: number,
  zz: number,
  tx: number,
  ty: number,
  tz: number,
];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function identity3(): Mat3D {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
}

/** Applies `n` first, then `m`. */
export function multiply3(m: Mat3D, n: Mat3D): Mat3D {
  const out = new Array<number>(12);
  for (let col = 0; col < 3; col++) {
    const x = n[col * 3];
    const y = n[col * 3 + 1];
    const z = n[col * 3 + 2];
    for (let row = 0; row < 3; row++) out[col * 3 + row] = m[row] * x + m[3 + row] * y + m[6 + row] * z;
  }
  for (let row = 0; row < 3; row++) {
    out[9 + row] = m[row] * n[9] + m[3 + row] * n[10] + m[6 + row] * n[11] + m[9 + row];
  }
  return out as Mat3D;
}

export function applyToPoint3(m: Mat3D, p: Vec3): Vec3 {
  return {
    x: m[0] * p.x + m[3] * p.y + m[6] * p.z + m[9],
    y: m[1] * p.x + m[4] * p.y + m[7] * p.z + m[10],
    z: m[2] * p.x + m[5] * p.y + m[8] * p.z + m[11],
  };
}

/** A 2D matrix in the z = 0 plane; z passes through unchanged. */
export function embed2D(m: Mat2D): Mat3D {
  return [m[0], m[1], 0, m[2], m[3], 0, 0, 0, 1, m[4], m[5], 0];
}

/** The screen part of an orthographic projection: x and y of the axes and the translation. */
export function projectTo2D(m: Mat3D): Mat2D {
  return [m[0], m[1], m[3], m[4], m[9], m[10]];
}

export interface BoneTransform3D {
  x: number;
  y: number;
  z: number;
  /** Rotation in the screen plane (degrees, clockwise positive in y-down), as in fromTRS. */
  rotation: number;
  /** Around the local y axis: the bone tip comes towards the camera (positive) or goes away. */
  tilt: number;
  /** Around the local x axis (the bone axis): the local +y side comes towards the camera (positive). */
  turn: number;
  scaleX: number;
  scaleY: number;
}

/** T(x, y, z) · Rz(rotation) · Ry(tilt) · Rx(turn) · S(scaleX, scaleY, 1); tilt and turn are limited to ±85°. */
export function fromBone3D(o: BoneTransform3D): Mat3D {
  const r = o.rotation * DEG2RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  if (o.tilt === 0 && o.turn === 0) {
    // Same arithmetic as fromTRS, so a flat pose is bit-identical to the 2D chain.
    return [cos * o.scaleX, sin * o.scaleX, 0, -sin * o.scaleY, cos * o.scaleY, 0, 0, 0, 1, o.x, o.y, o.z];
  }
  const t = cosSinDeg(clamp(o.tilt, -MAX_DEPTH_ANGLE_DEG, MAX_DEPTH_ANGLE_DEG));
  const u = cosSinDeg(clamp(o.turn, -MAX_DEPTH_ANGLE_DEG, MAX_DEPTH_ANGLE_DEG));
  const rz: Mat3D = [cos, sin, 0, -sin, cos, 0, 0, 0, 1, 0, 0, 0];
  const ry: Mat3D = [t.cos, 0, t.sin, 0, 1, 0, -t.sin, 0, t.cos, 0, 0, 0];
  const rx: Mat3D = [1, 0, 0, 0, u.cos, u.sin, 0, -u.sin, u.cos, 0, 0, 0];
  const m = multiply3(rz, multiply3(ry, rx));
  return [
    m[0] * o.scaleX,
    m[1] * o.scaleX,
    m[2] * o.scaleX,
    m[3] * o.scaleY,
    m[4] * o.scaleY,
    m[5] * o.scaleY,
    m[6],
    m[7],
    m[8],
    o.x,
    o.y,
    o.z,
  ];
}
