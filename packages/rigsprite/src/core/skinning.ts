import { invert, multiply, type Mat2D } from './math';
import { embed2D, multiply3, type Mat3D } from './math3d';
import type { Mesh, Weights } from './mesh';

/**
 * Skin matrix per bone = pose · rest⁻¹. Bones missing in `poseWorld` are skipped.
 * `restInverse` (e.g. from getRestPose) skips re-inverting the rest transforms.
 */
export function skinMatrices(
  restWorld: Record<string, Mat2D>,
  poseWorld: Record<string, Mat2D>,
  restInverse?: Record<string, Mat2D>,
): Record<string, Mat2D> {
  const out: Record<string, Mat2D> = {};
  for (const id of Object.keys(restWorld)) {
    const pose = poseWorld[id];
    if (!pose) continue;
    out[id] = multiply(pose, restInverse?.[id] ?? invert(restWorld[id]));
  }
  return out;
}

/** Linear blend skinning of the mesh rest positions. */
export function skinVertices(mesh: Mesh, weights: Weights, skin: Record<string, Mat2D>): Float32Array {
  const count = mesh.positions.length / 2;
  const out = new Float32Array(count * 2);
  for (let v = 0; v < count; v++) {
    const px = mesh.positions[v * 2];
    const py = mesh.positions[v * 2 + 1];
    let x = 0;
    let y = 0;
    let wsum = 0;
    for (let k = 0; k < 4; k++) {
      const w = weights.values[v * 4 + k];
      if (w <= 0) continue;
      const m = skin[weights.boneIds[weights.indices[v * 4 + k]]];
      if (!m) continue;
      x += w * (m[0] * px + m[2] * py + m[4]);
      y += w * (m[1] * px + m[3] * py + m[5]);
      wsum += w;
    }
    if (wsum > 0) {
      out[v * 2] = x / wsum;
      out[v * 2 + 1] = y / wsum;
    } else {
      out[v * 2] = px;
      out[v * 2 + 1] = py;
    }
  }
  return out;
}

/**
 * Skin matrices for a pose with depth: pose · rest⁻¹ in 3D. The rest pose lies in the z = 0 plane, so the
 * 2D inverse (e.g. from getRestPose) is embedded. Bones without a rest inverse are skipped.
 */
export function skinMatrices3D(
  restInverse: Record<string, Mat2D>,
  poseWorld: Record<string, Mat3D>,
): Record<string, Mat3D> {
  const out: Record<string, Mat3D> = {};
  for (const id of Object.keys(poseWorld)) {
    const inv = restInverse[id];
    if (inv) out[id] = multiply3(poseWorld[id], embed2D(inv));
  }
  return out;
}

/**
 * skinVertices with depth: the screen positions (x, y) as before plus the mean depth (z) of the skinned
 * vertices, which decides the draw order of the part. The mesh lies in the z = 0 plane.
 */
export function skinVertices3D(
  mesh: Mesh,
  weights: Weights,
  skin: Record<string, Mat3D>,
): { positions: Float32Array; depth: number } {
  const count = mesh.positions.length / 2;
  const positions = new Float32Array(count * 2);
  let zSum = 0;
  for (let v = 0; v < count; v++) {
    const px = mesh.positions[v * 2];
    const py = mesh.positions[v * 2 + 1];
    let x = 0;
    let y = 0;
    let z = 0;
    let wsum = 0;
    for (let k = 0; k < 4; k++) {
      const w = weights.values[v * 4 + k];
      if (w <= 0) continue;
      const m = skin[weights.boneIds[weights.indices[v * 4 + k]]];
      if (!m) continue;
      x += w * (m[0] * px + m[3] * py + m[9]);
      y += w * (m[1] * px + m[4] * py + m[10]);
      z += w * (m[2] * px + m[5] * py + m[11]);
      wsum += w;
    }
    if (wsum > 0) {
      positions[v * 2] = x / wsum;
      positions[v * 2 + 1] = y / wsum;
      zSum += z / wsum;
    } else {
      positions[v * 2] = px;
      positions[v * 2 + 1] = py;
    }
  }
  // `|| 0` turns -0 and NaN into 0.
  return { positions, depth: zSum / count || 0 };
}
