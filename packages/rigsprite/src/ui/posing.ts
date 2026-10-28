import { angleOf, invert, normalizeAngle, RAD2DEG, type Mat2D, type Vec2 } from '../core/math';
import { boneById, boneOrigin, computeWorldTransforms, type Pose, type Rig } from '../core/rig';

/** New rotation offset so that the (posed) bone points from its origin at `target`. */
export function rotationOffsetToward(rig: Rig, pose: Pose, boneId: string, target: Vec2): number {
  const current = pose[boneId]?.rotation ?? 0;
  const world = computeWorldTransforms(rig, pose)[boneId];
  if (!world) return current;
  const origin = boneOrigin(world);
  const desired = Math.atan2(target.y - origin.y, target.x - origin.x) * RAD2DEG;
  return current + normalizeAngle(desired - angleOf(world));
}

function tryInvert(m: Mat2D): Mat2D | null {
  try {
    return invert(m);
  } catch {
    return null;
  }
}

/** New x/y offset after moving the bone by `deltaWorld` (converted into its parent's space). */
export function translationOffsetToward(rig: Rig, pose: Pose, boneId: string, deltaWorld: Vec2): { x: number; y: number } {
  const x = pose[boneId]?.x ?? 0;
  const y = pose[boneId]?.y ?? 0;
  const bone = boneById(rig, boneId);
  const parentWorld = bone?.parentId != null ? computeWorldTransforms(rig, pose)[bone.parentId] : undefined;
  const parentInverse = parentWorld && tryInvert(parentWorld);
  // No parent space (root, or a parent squashed flat by scale or depth): move in world space.
  if (!parentInverse) return { x: x + deltaWorld.x, y: y + deltaWorld.y };
  const [a, b, c, d] = parentInverse;
  return { x: x + a * deltaWorld.x + c * deltaWorld.y, y: y + b * deltaWorld.x + d * deltaWorld.y };
}
