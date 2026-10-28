import { sampleAnimation } from '../core/animation';
import { MAX_DEPTH_ANGLE_DEG } from '../core/defaults';
import { clamp, type Mat2D, type Vec2 } from '../core/math';
import { boneById, boneOrigin, boneTip, type Bone } from '../core/rig';
import { worldToScreen, type ViewTransform } from '../render/view';
import { selectActiveAnimation, type EditorState } from '../state/store';
import { TILT_DEG_PER_PX, TILT_HANDLE_HIT_PX, TILT_HANDLE_OFFSET_PX } from './constants';

/** The tilt handle of the selected bone: its screen position and the bone direction it is dragged along. */
export interface TiltHandle {
  pos: Vec2;
  dir: Vec2;
}

/** Unit vector from the bone origin to its tip on the screen; (0, 1) for a bone without screen length. */
export function boneScreenDir(view: ViewTransform, world: Mat2D, bone: Bone): Vec2 {
  const o = worldToScreen(view, boneOrigin(world));
  const t = worldToScreen(view, boneTip(world, bone));
  const len = Math.hypot(t.x - o.x, t.y - o.y);
  return len > 1e-6 ? { x: (t.x - o.x) / len, y: (t.y - o.y) / len } : { x: 0, y: 1 };
}

/** Beside the middle of the bone, TILT_HANDLE_OFFSET_PX to its left (seen along the bone). */
export function tiltHandleScreenPos(view: ViewTransform, world: Mat2D, bone: Bone): Vec2 {
  const o = worldToScreen(view, boneOrigin(world));
  const t = worldToScreen(view, boneTip(world, bone));
  const dir = boneScreenDir(view, world, bone);
  return {
    x: (o.x + t.x) / 2 + dir.y * TILT_HANDLE_OFFSET_PX,
    y: (o.y + t.y) / 2 - dir.x * TILT_HANDLE_OFFSET_PX,
  };
}

/** A mouse must hit the handle circle; a finger gets a target twice as wide (44 px). */
export function hitTestTiltHandle(p: Vec2, handle: Vec2, pointerType: string): boolean {
  const radius = TILT_HANDLE_HIT_PX * (pointerType === 'touch' ? 2 : 1);
  return Math.hypot(p.x - handle.x, p.y - handle.y) <= radius;
}

/** Dragging `dragPx` towards the bone tip tilts the tip forward; the result stays within ±85°. */
export function tiltFromDrag(startTilt: number, dragPx: number): number {
  return clamp(startTilt + dragPx * TILT_DEG_PER_PX, -MAX_DEPTH_ANGLE_DEG, MAX_DEPTH_ANGLE_DEG);
}

/** Current tilt of a bone at the shown frame. */
export function sampledTilt(s: Pick<EditorState, 'project' | 'animationId' | 'frame'>, boneId: string): number {
  const anim = selectActiveAnimation(s);
  return (anim && sampleAnimation(anim, s.frame)[boneId]?.tilt) || 0;
}

type HandleState = Pick<EditorState, 'mode' | 'selectedBoneId' | 'animationId' | 'project' | 'showRig'>;

/** The handle, if it is offered: animate mode, an animation, a selected bone, a visible rig, depth not locked. */
export function activeTiltHandle(s: HandleState, world: Record<string, Mat2D>, view: ViewTransform): TiltHandle | null {
  if (s.mode !== 'animate' || !s.showRig || s.project.settings.depthLocked || !selectActiveAnimation(s)) return null;
  const bone = boneById(s.project.rig, s.selectedBoneId);
  const m = bone && world[bone.id];
  if (!bone || !m) return null;
  return { pos: tiltHandleScreenPos(view, m, bone), dir: boneScreenDir(view, m, bone) };
}
