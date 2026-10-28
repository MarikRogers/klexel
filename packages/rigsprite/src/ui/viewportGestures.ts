import { sampleAnimation } from '../core/animation';
import type { FrameData } from '../core/frame';
import { applyToPoint, dist, invert, type Vec2 } from '../core/math';
import type { Layer } from '../render/layers';
import { pinchView, screenToWorld, type ViewTransform } from '../render/view';
import { selectActiveAnimation, useEditor, type EditorState } from '../state/store';
import { BONE_HIT_PX, DRAG_THRESHOLD_PX, ORBIT_DEG_PER_PX, TOUCH_HIT_FACTOR } from './constants';
import { hitTestBone, hitTestPart } from './hitTest';
import { rotationOffsetToward, translationOffsetToward } from './posing';
import { activeTiltHandle, hitTestTiltHandle, sampledTilt, tiltFromDrag } from './tiltHandle';

/** What the gestures need from a pointer event (screen point in CSS pixels relative to the viewport). */
export interface GesturePointer {
  pointerId: number;
  button: number;
  pointerType: string;
  shiftKey: boolean;
  p: Vec2;
}

/** Shared by the one-pointer drags. */
interface DragBase {
  pointerId: number;
  startScreen: Vec2;
}

interface PanDrag extends DragBase {
  kind: 'pan';
  startView: EditorState['view'];
}

interface OrbitDrag extends DragBase {
  kind: 'orbit';
  startOrbit: EditorState['orbit'];
}

interface PartDrag extends DragBase {
  kind: 'part';
  partId: string;
  startWorld: Vec2;
  origin: Vec2;
  moved: boolean;
}

interface PoseDrag extends DragBase {
  kind: 'pose';
  boneId: string;
  lastWorld: Vec2;
  moved: boolean;
}

interface TiltDrag extends DragBase {
  kind: 'tilt';
  boneId: string;
  startTilt: number;
  /** Bone direction on the screen at the start; dragging towards the tip tilts it forward. */
  dir: Vec2;
  moved: boolean;
}

interface Pinch {
  kind: 'pinch';
  ids: [number, number];
  prev: [Vec2, Vec2];
}

export type Gesture = { kind: 'idle' } | PanDrag | OrbitDrag | PartDrag | PoseDrag | TiltDrag | Pinch;
type Drag = PanDrag | OrbitDrag | PartDrag | PoseDrag | TiltDrag;

const IDLE: Gesture = { kind: 'idle' };

const isDrag = (g: Gesture): g is Drag =>
  g.kind === 'pan' || g.kind === 'orbit' || g.kind === 'part' || g.kind === 'pose' || g.kind === 'tilt';

/** Part / pose drags change the project only once the pointer moved DRAG_THRESHOLD_PX (then for good). */
function pastThreshold(d: PartDrag | PoseDrag | TiltDrag, p: Vec2): boolean {
  if (!d.moved && dist(p, d.startScreen) < DRAG_THRESHOLD_PX) return false;
  d.moved = true;
  return true;
}

function activePose(s: EditorState) {
  const anim = selectActiveAnimation(s);
  return anim ? sampleAnimation(anim, s.frame) : {};
}

export interface GestureContext {
  /** The current view in CSS pixels. */
  view(s: EditorState): ViewTransform;
  /** The frame currently shown. */
  frame(s: EditorState): FrameData;
  /** The frame's sprites in draw order with their depths (see orderLayers; cached by the caller). */
  layers(s: EditorState): Layer[];
}

export interface DownResult {
  /** The pointer is tracked: capture it. */
  tracked: boolean;
  /** Suppress the browser default (middle-button autoscroll, right-button menu). */
  preventDefault: boolean;
}

export interface ViewportGestures {
  readonly current: Gesture;
  down(e: GesturePointer): DownResult;
  move(e: GesturePointer): void;
  /** Pointer released (`commit`) or cancelled / capture lost (abort). */
  end(pointerId: number, commit: boolean): void;
  /** Window lost focus: forget all pointers, commit a running drag. */
  blur(): void;
  /** Viewport unmounts: commit a running drag. */
  dispose(): void;
}

/**
 * Viewport pointer gestures as a state machine `idle | pan | orbit | part | pose | tilt | pinch`:
 * - left button: select; in setup mode drag a part, in animate mode pose a bone (Shift: translate);
 *   parts are picked on their layer (depth), bones on the rig plane; drags work in depth 0 (deltas
 *   do not depend on the depth);
 * - in animate mode the tilt handle of the selected bone (when offered, see activeTiltHandle) tilts it;
 * - middle button or Space + left: pan;
 * - right mouse button: orbit the camera (no undo entry); only from idle;
 * - a second finger cancels any one-finger drag (no undo entry) and starts pinch-zoom / pan.
 * Part and pose drags run inside a store transaction: release = one undo entry, cancel = none.
 */
export function createViewportGestures(ctx: GestureContext): ViewportGestures {
  const store = () => useEditor.getState();
  // Active pointers (screen position by pointerId).
  const pointers = new Map<number, Vec2>();
  let gesture: Gesture = IDLE;

  const finishDrag = (commit: boolean) => {
    if (!isDrag(gesture)) return;
    const d = gesture;
    gesture = IDLE;
    if (d.kind === 'pan' || d.kind === 'orbit') return;
    if (commit) store().commitTransaction();
    else store().cancelTransaction();
  };

  const startDrag = (e: GesturePointer): Drag | null => {
    const { pointerId, p } = e;
    const s = store();
    if (e.button === 1 || (e.button === 0 && s.spaceHeld)) {
      if (s.spaceHeld) s.setSpacePanned(true);
      return { kind: 'pan', pointerId, startScreen: p, startView: s.view };
    }
    if (e.button !== 0) return null;

    const hitPx = BONE_HIT_PX * (e.pointerType === 'touch' ? TOUCH_HIT_FACTOR : 1);
    const view = ctx.view(s);
    const w = screenToWorld(view, p);
    const { world } = ctx.frame(s);
    const partId = hitTestPart(ctx.layers(s), view, p);
    // A hidden rig is not clickable: only the sprites are.
    const boneAt = () => (s.showRig ? hitTestBone(s.project.rig, world, w, hitPx / view.zoom) : null);
    if (s.mode === 'animate') {
      // The tilt handle of the selected bone comes before bones and sprites.
      const handle = activeTiltHandle(s, world, view);
      if (handle && s.selectedBoneId && hitTestTiltHandle(p, handle.pos, e.pointerType)) {
        s.beginTransaction();
        return {
          kind: 'tilt',
          pointerId,
          boneId: s.selectedBoneId,
          startScreen: p,
          startTilt: sampledTilt(s, s.selectedBoneId),
          dir: handle.dir,
          moved: false,
        };
      }
      const boneId =
        boneAt() ??
        (partId ? s.project.parts.find((x) => x.id === partId)!.boneId : null);
      s.select(boneId, boneId && partId ? partId : null);
      if (!boneId || !selectActiveAnimation(s)) return null;
      // One drag = one undo entry; the transaction also stops playback.
      s.beginTransaction();
      return { kind: 'pose', pointerId, boneId, startScreen: p, lastWorld: w, moved: false };
    }
    if (partId) {
      const part = s.project.parts.find((x) => x.id === partId)!;
      s.select(part.boneId, partId);
      if (s.mode !== 'setup') return null;
      s.beginTransaction();
      return { kind: 'part', pointerId, partId, startScreen: p, startWorld: w, origin: { x: part.x, y: part.y }, moved: false };
    }
    s.select(boneAt(), null);
    return null;
  };

  const movePose = (d: PoseDrag, e: GesturePointer) => {
    const s = store();
    const w = screenToWorld(ctx.view(s), e.p);
    if (!pastThreshold(d, e.p)) return;
    const pose = activePose(s);
    if (e.shiftKey) {
      const delta = { x: w.x - d.lastWorld.x, y: w.y - d.lastWorld.y };
      s.poseBone(d.boneId, translationOffsetToward(s.project.rig, pose, d.boneId, delta));
    } else {
      s.poseBone(d.boneId, { rotation: rotationOffsetToward(s.project.rig, pose, d.boneId, w) });
    }
    d.lastWorld = w;
  };

  const moveTilt = (d: TiltDrag, p: Vec2) => {
    if (!pastThreshold(d, p)) return;
    const along = (p.x - d.startScreen.x) * d.dir.x + (p.y - d.startScreen.y) * d.dir.y;
    store().poseBone(d.boneId, { tilt: tiltFromDrag(d.startTilt, along) });
  };

  const movePart = (d: PartDrag, p: Vec2) => {
    if (!pastThreshold(d, p)) return;
    const s = store();
    const part = s.project.parts.find((x) => x.id === d.partId);
    const boneWorld = part && ctx.frame(s).world[part.boneId];
    if (!part || !boneWorld) return;
    // World-space pointer delta → local bone space via the inverse bone transform.
    const inv = invert(boneWorld);
    const a = applyToPoint(inv, d.startWorld);
    const b = applyToPoint(inv, screenToWorld(ctx.view(s), p));
    s.updatePart(part.id, { x: d.origin.x + b.x - a.x, y: d.origin.y + b.y - a.y });
  };

  return {
    get current() {
      return gesture;
    },

    down(e) {
      if (e.button === 2 && e.pointerType === 'mouse') {
        // Orbit only from idle: a right click during a drag or pinch is ignored.
        if (gesture.kind !== 'idle' || pointers.size > 0) return { tracked: false, preventDefault: false };
        pointers.set(e.pointerId, e.p);
        gesture = { kind: 'orbit', pointerId: e.pointerId, startScreen: e.p, startOrbit: store().orbit };
        return { tracked: true, preventDefault: true };
      }
      // Otherwise left (select/drag) and middle (pan) only; touch and pen report button 0.
      if (e.button !== 0 && e.button !== 1) return { tracked: false, preventDefault: false };
      pointers.set(e.pointerId, e.p);
      if (pointers.size === 2) {
        // Second finger: abandon any one-finger drag without an undo entry, then pinch-zoom / pan.
        finishDrag(false);
        const ids = [...pointers.keys()] as [number, number];
        gesture = { kind: 'pinch', ids, prev: [pointers.get(ids[0])!, pointers.get(ids[1])!] };
        return { tracked: true, preventDefault: false };
      }
      if (pointers.size > 2 || gesture.kind !== 'idle') return { tracked: true, preventDefault: false };
      const drag = startDrag(e);
      if (drag) gesture = drag;
      return { tracked: true, preventDefault: drag?.kind === 'pan' };
    },

    move(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e.p);
      const g = gesture;
      if (g.kind === 'pinch') {
        if (!g.ids.includes(e.pointerId)) return;
        const next: [Vec2, Vec2] = [pointers.get(g.ids[0])!, pointers.get(g.ids[1])!];
        const s = store();
        const { x, y, zoom } = pinchView(ctx.view(s), g.prev, next);
        g.prev = next;
        s.setView({ x, y, zoom });
        return;
      }
      if (!isDrag(g) || g.pointerId !== e.pointerId) return;
      if (g.kind === 'pan') {
        const v = g.startView;
        store().setView({ ...v, x: v.x + e.p.x - g.startScreen.x, y: v.y + e.p.y - g.startScreen.y });
      } else if (g.kind === 'orbit') {
        const o = g.startOrbit;
        const dx = e.p.x - g.startScreen.x;
        const dy = e.p.y - g.startScreen.y;
        store().setOrbit(o.yaw - dx * ORBIT_DEG_PER_PX, o.pitch + dy * ORBIT_DEG_PER_PX);
      } else if (store().transaction === null) {
        // The project was loaded / created mid-drag: the transaction is gone, drop the drag.
        gesture = IDLE;
      } else if (g.kind === 'pose') {
        movePose(g, e);
      } else if (g.kind === 'tilt') {
        moveTilt(g, e.p);
      } else {
        movePart(g, e.p);
      }
    },

    end(pointerId, commit) {
      if (!pointers.delete(pointerId)) return;
      if (gesture.kind === 'pinch') {
        if (gesture.ids.includes(pointerId)) gesture = IDLE;
        return;
      }
      if (isDrag(gesture) && gesture.pointerId === pointerId) finishDrag(commit);
    },

    blur() {
      pointers.clear();
      if (gesture.kind === 'pinch') gesture = IDLE;
      finishDrag(true);
    },

    dispose() {
      finishDrag(true);
    },
  };
}
