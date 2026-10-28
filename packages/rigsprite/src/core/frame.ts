import { sampleAnimation, type Animation } from './animation';
import type { Mat2D } from './math';
import { getPartMesh } from './mesh';
import type { Part } from './part';
import { computeWorldTransforms, getRestPose, type Pose, type Rig } from './rig';
import { skinMatrices, skinVertices } from './skinning';

export interface DrawItem {
  partId: string;
  imageId: string;
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
  z: number;
}

export interface FrameInput {
  rig: Rig;
  parts: Part[];
  images: Record<string, { width: number; height: number }>;
  animation: Animation | null;
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

export function buildFrame(input: FrameInput, frame: number, extraPose?: Pose): FrameData {
  const { rig, parts, images, animation } = input;
  const boneIds = new Set(rig.bones.map((b) => b.id));
  const sampled = animation ? sampleAnimation(animation, frame) : {};
  const pose: Pose = {};
  for (const [id, offset] of Object.entries(mergePose(sampled, extraPose))) {
    if (boneIds.has(id)) pose[id] = offset;
  }

  // Rest pose, meshes and weights are cached per Rig / Part object; per frame only the skinning runs.
  const { restWorld, restInverse } = getRestPose(rig);
  const world = computeWorldTransforms(rig, pose);
  const skin = skinMatrices(restWorld, world, restInverse);

  const items: DrawItem[] = [];
  for (const part of parts) {
    if (!part.visible || !boneIds.has(part.boneId)) continue;
    const image = images[part.imageId];
    if (!image) continue;
    const { mesh, weights } = getPartMesh(rig, part, image);
    items.push({
      partId: part.id,
      imageId: part.imageId,
      positions: skinVertices(mesh, weights, skin),
      uvs: mesh.uvs,
      indices: mesh.indices,
      z: part.z,
    });
  }
  items.sort((a, b) => a.z - b.z);
  return { world, items };
}
