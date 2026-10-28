import { MIN_BONE_LENGTH, MIN_SOFTNESS } from './defaults';
import { applyToPoint, fromTRS, invert, multiply, type Mat2D, type Vec2 } from './math';

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  rotation: number;
  length: number;
  softness: number;
}

export interface Rig {
  bones: Bone[];
}

export interface BoneOffset {
  rotation: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export type Pose = Record<string, Partial<BoneOffset>>;

export function boneById(rig: Rig, id: string | null | undefined): Bone | undefined {
  return id == null ? undefined : rig.bones.find((b) => b.id === id);
}

/** Clamps `length` to >= MIN_BONE_LENGTH and `softness` to >= MIN_SOFTNESS; other fields pass through. */
export function sanitizeBonePatch<P extends Partial<Bone>>(patch: P): P {
  const out = { ...patch };
  if (out.length !== undefined) out.length = Math.max(MIN_BONE_LENGTH, out.length);
  if (out.softness !== undefined) out.softness = Math.max(MIN_SOFTNESS, out.softness);
  return out;
}

export function computeWorldTransforms(rig: Rig, pose: Pose = {}): Record<string, Mat2D> {
  const byId = new Map(rig.bones.map((b) => [b.id, b]));
  const result: Record<string, Mat2D> = {};

  const resolve = (bone: Bone): Mat2D => {
    const cached = result[bone.id];
    if (cached) return cached;
    const o = pose[bone.id] ?? {};
    const local = fromTRS(
      bone.x + (o.x ?? 0),
      bone.y + (o.y ?? 0),
      bone.rotation + (o.rotation ?? 0),
      o.scaleX ?? 1,
      o.scaleY ?? 1,
    );
    const parent = bone.parentId !== null ? byId.get(bone.parentId) : undefined;
    const world = parent ? multiply(resolve(parent), local) : local;
    result[bone.id] = world;
    return world;
  };

  for (const bone of rig.bones) resolve(bone);
  return result;
}

/** World transforms of the rest pose and their inverses. Shared, cached values: never mutate. */
export interface RestPose {
  restWorld: Record<string, Mat2D>;
  restInverse: Record<string, Mat2D>;
}

const restPoseCache = new WeakMap<Rig, RestPose>();

/**
 * Rest pose of `rig`, cached per Rig object. Rigs are immutable (every bone edit creates a new Rig),
 * so object identity is the cache key.
 */
export function getRestPose(rig: Rig): RestPose {
  let rest = restPoseCache.get(rig);
  if (!rest) {
    const restWorld = computeWorldTransforms(rig);
    const restInverse: Record<string, Mat2D> = {};
    for (const id of Object.keys(restWorld)) restInverse[id] = invert(restWorld[id]);
    rest = { restWorld, restInverse };
    restPoseCache.set(rig, rest);
  }
  return rest;
}

export function boneOrigin(world: Mat2D): Vec2 {
  return applyToPoint(world, { x: 0, y: 0 });
}

export function boneTip(world: Mat2D, bone: Bone): Vec2 {
  return applyToPoint(world, { x: bone.length, y: 0 });
}

export function childrenOf(rig: Rig, boneId: string): Bone[] {
  return rig.bones.filter((b) => b.parentId === boneId);
}

export function descendantIds(rig: Rig, boneId: string): string[] {
  const out = [boneId];
  for (let i = 0; i < out.length; i++) {
    for (const c of childrenOf(rig, out[i])) out.push(c.id);
  }
  return out;
}

export function rigBounds(rig: Rig): { minX: number; minY: number; maxX: number; maxY: number } {
  const world = computeWorldTransforms(rig);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const bone of rig.bones) {
    for (const p of [boneOrigin(world[bone.id]), boneTip(world[bone.id], bone)]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

export function rigHeight(rig: Rig): number {
  const b = rigBounds(rig);
  return b.maxY - b.minY;
}

export function defaultSoftness(length: number): number {
  return Math.max(4, Math.round(0.25 * length));
}

export type RigTemplateId =
  | 'humanoid'
  | 'quadruped'
  | 'humanoid-front'
  | 'humanoid-back'
  | 'quadruped-front'
  | 'quadruped-back';

export interface RigTemplate {
  id: RigTemplateId;
  name: string;
  rig: Rig;
}
