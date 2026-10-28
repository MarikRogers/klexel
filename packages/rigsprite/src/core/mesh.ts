import { applyToPoint, clamp, fromTRS, multiply, smoothstep, type Mat2D, type Vec2 } from './math';
import type { Part } from './part';
import { boneById, boneOrigin, childrenOf, getRestPose, type Rig } from './rig';

export interface Mesh {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  cols: number;
  rows: number;
}

export interface Weights {
  boneIds: string[];
  indices: Uint8Array;
  values: Float32Array;
}

function dirOf(m: Mat2D): Vec2 {
  const len = Math.hypot(m[0], m[1]) || 1;
  return { x: m[0] / len, y: m[1] / len };
}

export function buildGridMesh(
  part: Part,
  image: { width: number; height: number },
  rig: Rig,
  restWorld: Record<string, Mat2D>,
): Mesh {
  const bone = boneById(rig, part.boneId);
  if (!bone) throw new Error(`buildGridMesh: unknown bone ${part.boneId}`);
  const softnesses = childrenOf(rig, bone.id).map((c) => c.softness);
  if (bone.parentId !== null) softnesses.push(bone.softness);
  const minSoftness = softnesses.length > 0 ? Math.min(...softnesses) : bone.softness;
  const cell = clamp(minSoftness / 2, 4, 32);

  const { width: w, height: h } = image;
  const cols = clamp(Math.ceil((w * Math.abs(part.scaleX)) / cell), 1, 48);
  const rows = clamp(Math.ceil((h * Math.abs(part.scaleY)) / cell), 1, 48);

  const m = multiply(restWorld[bone.id], fromTRS(part.x, part.y, part.rotation, part.scaleX, part.scaleY));
  const vertCount = (cols + 1) * (rows + 1);
  const positions = new Float32Array(vertCount * 2);
  const uvs = new Float32Array(vertCount * 2);
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const k = (j * (cols + 1) + i) * 2;
      const u = i / cols;
      const v = j / rows;
      const p = applyToPoint(m, { x: u * w - w / 2, y: v * h - h / 2 });
      positions[k] = p.x;
      positions[k + 1] = p.y;
      uvs[k] = u;
      uvs[k + 1] = v;
    }
  }

  const indices = new Uint16Array(cols * rows * 6);
  let n = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices[n++] = a;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = d;
      indices[n++] = c;
    }
  }
  return { positions, uvs, indices, cols, rows };
}

/** A joint around the owning bone, precomputed once per weights call. */
interface Joint {
  jx: number;
  jy: number;
  r: number;
  dirX: number;
  dirY: number;
  /** Slot of the bone on the other side of the joint. */
  other: number;
  /** True if the owning bone is the joint's child side (the joint is the bone's own origin). */
  ownIsChild: boolean;
}

/**
 * Everything pointWeights needs for one owning bone. Candidate bones live in `slots`, ordered exactly
 * like the keys of the weight record the original implementation built (JS object key order), so
 * sums, tie-breaks and the resulting bone order stay bit-identical.
 */
interface WeightContext {
  slots: string[];
  own: number;
  joints: Joint[];
  /** Scratch buffer, one weight per slot. */
  vals: Float64Array;
}

function weightContext(rig: Rig, boneId: string, restWorld: Record<string, Mat2D>): WeightContext {
  const bone = boneById(rig, boneId);
  if (!bone) throw new Error(`pointWeights: unknown bone ${boneId}`);
  const raw: { id: string; r: number; parentSide: string; childSide: string }[] = [];
  if (bone.parentId !== null) raw.push({ id: bone.id, r: bone.softness, parentSide: bone.parentId, childSide: bone.id });
  for (const c of childrenOf(rig, bone.id)) raw.push({ id: c.id, r: c.softness, parentSide: bone.id, childSide: c.id });

  const otherOf = (j: (typeof raw)[number]) => (bone.id === j.childSide ? j.parentSide : j.childSide);
  // Same insertion sequence as the record { [boneId]: 1 } plus one key per joint; Object.keys gives its order.
  const keyOrder: Record<string, true> = { [boneId]: true };
  for (const j of raw) keyOrder[otherOf(j)] = true;
  const slots = Object.keys(keyOrder);
  const slotOf = new Map(slots.map((id, i) => [id, i]));

  const joints = raw.map((j): Joint => {
    const m = restWorld[j.id];
    const J = boneOrigin(m);
    const dir = dirOf(m);
    return {
      jx: J.x,
      jy: J.y,
      r: j.r,
      dirX: dir.x,
      dirY: dir.y,
      other: slotOf.get(otherOf(j))!,
      ownIsChild: bone.id === j.childSide,
    };
  });
  return { slots, own: slotOf.get(bone.id)!, joints, vals: new Float64Array(slots.length) };
}

/** Fills `ctx.vals` with the normalized weights of point (px, py); returns false if all weights vanished. */
function evalWeights(ctx: WeightContext, px: number, py: number): boolean {
  const { vals, own, joints } = ctx;
  vals.fill(0);
  vals[own] = 1;
  for (const j of joints) {
    const dx = px - j.jx;
    const dy = py - j.jy;
    const s = dx * j.dirX + dy * j.dirY;
    const f = smoothstep(-j.r, j.r, s);
    const m = 1 - smoothstep(j.r, 2 * j.r, Math.hypot(dx, dy));
    const t = j.ownIsChild ? m * (1 - f) : m * f;
    vals[j.other] += t;
    vals[own] -= t;
  }
  let sum = 0;
  for (let k = 0; k < vals.length; k++) {
    vals[k] = Math.max(0, vals[k]);
    sum += vals[k];
  }
  if (sum <= 0) return false;
  for (let k = 0; k < vals.length; k++) vals[k] /= sum;
  return true;
}

/**
 * Blend weights of a rest-pose world point for a part owned by `boneId`.
 * Depends only on the joints around the owning bone and is symmetric across a joint,
 * so neighbouring parts compute identical weights near their shared joint (no gaps).
 */
export function pointWeights(
  p: Vec2,
  rig: Rig,
  boneId: string,
  restWorld: Record<string, Mat2D>,
): Record<string, number> {
  const ctx = weightContext(rig, boneId, restWorld);
  if (!evalWeights(ctx, p.x, p.y)) return { [boneId]: 1 };
  const w: Record<string, number> = {};
  ctx.slots.forEach((id, k) => (w[id] = ctx.vals[k]));
  return w;
}

export function computeWeights(
  positions: Float32Array,
  rig: Rig,
  boneId: string,
  restWorld: Record<string, Mat2D>,
): Weights {
  const ctx = weightContext(rig, boneId, restWorld);
  const { vals, own, slots } = ctx;
  const count = positions.length / 2;
  const indices = new Uint8Array(count * 4);
  const values = new Float32Array(count * 4);
  // Bone index in `boneIds` per slot, assigned in order of first use (-1 = unused so far).
  const slotIndex = new Int32Array(slots.length).fill(-1);
  const boneIds: string[] = [];
  const topSlot = new Int32Array(4);
  const topVal = new Float64Array(4);
  for (let v = 0; v < count; v++) {
    if (!evalWeights(ctx, positions[v * 2], positions[v * 2 + 1])) {
      vals.fill(0);
      vals[own] = 1;
    }
    // The 4 largest positive weights, descending; ties keep slot order (like a stable sort).
    let n = 0;
    for (let k = 0; k < vals.length; k++) {
      const val = vals[k];
      if (!(val > 0)) continue;
      let pos = n;
      while (pos > 0 && topVal[pos - 1] < val) pos--;
      if (pos >= 4) continue;
      for (let i = Math.min(n, 3); i > pos; i--) {
        topSlot[i] = topSlot[i - 1];
        topVal[i] = topVal[i - 1];
      }
      topSlot[pos] = k;
      topVal[pos] = val;
      if (n < 4) n++;
    }
    let total = 0;
    for (let i = 0; i < n; i++) total += topVal[i];
    total = total || 1;
    for (let i = 0; i < n; i++) {
      const slot = topSlot[i];
      if (slotIndex[slot] < 0) {
        slotIndex[slot] = boneIds.length;
        boneIds.push(slots[slot]);
      }
      indices[v * 4 + i] = slotIndex[slot];
      values[v * 4 + i] = topVal[i] / total;
    }
  }
  return { boneIds, indices, values };
}

export interface PartMesh {
  mesh: Mesh;
  weights: Weights;
}

interface MeshCacheEntry extends PartMesh {
  part: Part;
  width: number;
  height: number;
}

/**
 * The last mesh built for each part id (with the inputs it was built from) of the most recent Rig only,
 * so undo-history Rigs do not keep their meshes alive.
 */
let meshCache: { rig: Rig; map: Map<string, MeshCacheEntry> } | null = null;

/**
 * Rest mesh and skin weights of `part`, cached. Rig and Part are immutable (every edit creates a new
 * object), so the cache is keyed by their identity plus the image size; any change rebuilds.
 * The returned arrays are shared between frames: never mutate them.
 */
export function getPartMesh(rig: Rig, part: Part, image: { width: number; height: number }): PartMesh {
  if (meshCache?.rig !== rig) meshCache = { rig, map: new Map() };
  const byPart = meshCache.map;
  const hit = byPart.get(part.id);
  if (hit && hit.part === part && hit.width === image.width && hit.height === image.height) return hit;
  const { restWorld } = getRestPose(rig);
  const mesh = buildGridMesh(part, image, rig, restWorld);
  const entry: MeshCacheEntry = {
    part,
    width: image.width,
    height: image.height,
    mesh,
    weights: computeWeights(mesh.positions, rig, part.boneId, restWorld),
  };
  byPart.set(part.id, entry);
  return entry;
}
