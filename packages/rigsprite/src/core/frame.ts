import { sampleAnimation, type Animation } from './animation';
import type { Mat2D } from './math';
import { getPartMesh } from './mesh';
import type { Part } from './part';
import { projectTo2D } from './math3d';
import { computeWorldTransforms, computeWorldTransforms3D, getRestPose, poseUsesDepth, type BoneOffset, type Pose, type Rig } from './rig';
import { skinMatrices, skinMatrices3D, skinVertices, skinVertices3D } from './skinning';

export interface DrawItem {
  partId: string;
  imageId: string;
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  z: number;
  /** Mean depth of the skinned part (towards the front camera); absent = 0. Decides the draw order. */
  depth?: number;
}

export interface FrameInput {
  rig: Rig;
  parts: Part[];
  images: Record<string, { width: number; height: number }>;
  animation: Animation | null;
  /** Tilt, turn and depth are ignored (project setting). */
  depthLocked?: boolean;
}

export interface FrameData {
  world: Record<string, Mat2D>;
  items: DrawItem[];
}

/** Overlays `extra` on `base` per bone and channel (extra wins). */
function mergePose(base: Pose, extra: Pose | undefined): Pose {
  if (!extra) return base;
  const out: Pose = { ...base };
  for (const [id, offset] of Object.entries(extra)) out[id] = { ...base[id], ...offset };
  return out;
}

/** `offset` without the depth channels. */
function withoutDepth(offset: Partial<BoneOffset>): Partial<BoneOffset> {
  const { tilt: _tilt, turn: _turn, depth: _depth, ...flat } = offset;
  return flat;
}

function mapValues<A, B>(o: Record<string, A>, fn: (a: A) => B): Record<string, B> {
  const out: Record<string, B> = {};
  for (const [k, v] of Object.entries(o)) out[k] = fn(v);
  return out;
}

export function buildFrame(input: FrameInput, frame: number, extraPose?: Pose): FrameData {
  const { rig, parts, images, animation } = input;
  const boneIds = new Set(rig.bones.map((b) => b.id));
  const sampled = animation ? sampleAnimation(animation, frame) : {};
  const pose: Pose = {};
  for (const [id, offset] of Object.entries(mergePose(sampled, extraPose))) {
    if (boneIds.has(id)) pose[id] = input.depthLocked ? withoutDepth(offset) : offset;
  }

  // Rest pose, meshes and weights are cached per Rig / Part object; per frame only the skinning runs.
  // Without depth values the plain 2D chain runs (bit-identical to before depth existed).
  const { restWorld, restInverse } = getRestPose(rig);
  const deep = poseUsesDepth(pose);
  const world3 = deep ? computeWorldTransforms3D(rig, pose) : null;
  const world = world3 ? mapValues(world3, projectTo2D) : computeWorldTransforms(rig, pose);
  const skin = world3 ? null : skinMatrices(restWorld, world, restInverse);
  const skin3 = world3 ? skinMatrices3D(restInverse, world3) : null;

  const items: DrawItem[] = [];
  for (const part of parts) {
    if (!part.visible || !boneIds.has(part.boneId)) continue;
    const image = images[part.imageId];
    if (!image) continue;
    const { mesh, weights } = getPartMesh(rig, part, image);
    const item: DrawItem = {
      partId: part.id,
      imageId: part.imageId,
      positions: skin ? skinVertices(mesh, weights, skin) : new Float32Array(0),
      uvs: mesh.uvs,
      indices: mesh.indices,
      z: part.z,
    };
    if (skin3) {
      const skinned = skinVertices3D(mesh, weights, skin3);
      item.positions = skinned.positions;
      item.depth = skinned.depth;
    }
    items.push(item);
  }
  items.sort((a, b) => a.z - b.z);
  return { world, items };
}
