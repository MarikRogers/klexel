import { beforeEach, describe, expect, it } from 'vitest';
import type { Vec2 } from '../core/math';
import { boneById, boneOrigin, boneTip } from '../core/rig';
import { createLayerCache } from '../render/layers';
import { worldToScreen } from '../render/view';
import { useEditor } from '../state/store';
import { makeImageAsset } from '../test/fixtures';
import { DRAG_THRESHOLD_PX } from './constants';
import { boneScreenDir, tiltFromDrag, tiltHandleScreenPos } from './tiltHandle';
import { createFrameCache } from './viewportFrame';
import { createViewportGestures, type GesturePointer, type ViewportGestures } from './viewportGestures';
import { cssView } from './viewportView';

const SIZE = { width: 800, height: 600, dpr: 1 };
const view = (s = useEditor.getState()) => cssView(s, SIZE);
const s = () => useEditor.getState();
const history = () => useEditor.temporal.getState().pastStates.length;

let g: ViewportGestures;
let frame: ReturnType<typeof createFrameCache>;

const ptr = (p: Vec2, over: Partial<GesturePointer> = {}): GesturePointer => ({
  pointerId: 1,
  button: 0,
  pointerType: 'mouse',
  shiftKey: false,
  p,
  ...over,
});
const add = (a: Vec2, dx: number, dy = 0) => ({ x: a.x + dx, y: a.y + dy });

/** Screen point at the middle of the only part (attached to lowerArm_L). */
function partPoint(): Vec2 {
  const item = frame(s()).items[0];
  let x = 0;
  let y = 0;
  const n = item.positions.length / 2;
  for (let i = 0; i < n; i++) {
    x += item.positions[2 * i];
    y += item.positions[2 * i + 1];
  }
  return worldToScreen(view(), { x: x / n, y: y / n });
}

/** Screen point in the middle of a bone. */
function bonePoint(id: string): Vec2 {
  const m = frame(s()).world[id];
  const o = boneOrigin(m);
  const t = boneTip(m, boneById(s().project.rig, id)!);
  return worldToScreen(view(), { x: (o.x + t.x) / 2, y: (o.y + t.y) / 2 });
}

const part = () => s().project.parts[0];

beforeEach(() => {
  s().newProject('humanoid');
  useEditor.setState({ spaceHeld: false, spacePanned: false, view: { x: 0, y: 0, zoom: 1 }, orbit: { yaw: 0, pitch: 0 }, showRig: true });
  s().addImages([makeImageAsset({ id: 'img', name: 'blob.png' })]);
  s().attachImage('img', 'lowerArm_L');
  useEditor.temporal.getState().clear();
  frame = createFrameCache();
  const layers = createLayerCache();
  g = createViewportGestures({ view, frame, layers: (st) => layers(frame(st).items, view(st), st.layerSpacing) });
});

describe('viewport gestures', () => {
  it('ignores other buttons', () => {
    expect(g.down(ptr({ x: 1, y: 1 }, { button: 3 }))).toEqual({ tracked: false, preventDefault: false });
    expect(g.current.kind).toBe('idle');
  });

  it('right button drag orbits the camera without an undo entry', () => {
    expect(g.down(ptr({ x: 100, y: 100 }, { button: 2 }))).toEqual({ tracked: true, preventDefault: true });
    expect(g.current.kind).toBe('orbit');
    g.move(ptr({ x: 110, y: 105 }));
    g.move(ptr({ x: 120, y: 110 }));
    expect(s().orbit).toEqual({ yaw: -10, pitch: 5 });
    g.end(1, true);
    expect(g.current.kind).toBe('idle');
    expect(s().transaction).toBeNull();
    expect(history()).toBe(0);
  });

  it('a right click during a pose drag is ignored', () => {
    s().setMode('animate');
    s().addAnimation('a');
    s().setView({ x: 0, y: 0, zoom: 4 });
    useEditor.temporal.getState().clear();
    const start = bonePoint('head');
    g.down(ptr(start));
    expect(g.current.kind).toBe('pose');
    expect(g.down(ptr(start, { pointerId: 2, button: 2 })).tracked).toBe(false);
    expect(g.current.kind).toBe('pose');
    g.move(ptr(add(start, 30, 40), { pointerId: 2 }));
    expect(s().orbit).toEqual({ yaw: 0, pitch: 0 });
    g.move(ptr(add(start, 30, 40)));
    g.end(1, true);
    expect(s().project.animations[0].tracks.head?.rotation?.length).toBe(1);
    expect(history()).toBe(1);
  });

  it('a right click during a pinch is ignored', () => {
    g.down(ptr({ x: 10, y: 10 }, { pointerType: 'touch' }));
    g.down(ptr({ x: 100, y: 100 }, { pointerId: 2, pointerType: 'touch' }));
    expect(g.current.kind).toBe('pinch');
    expect(g.down(ptr({ x: 50, y: 50 }, { pointerId: 3, button: 2 })).tracked).toBe(false);
    expect(g.current.kind).toBe('pinch');
    g.move(ptr({ x: 80, y: 80 }, { pointerId: 3 }));
    expect(s().orbit).toEqual({ yaw: 0, pitch: 0 });
  });

  it('orbited view: a part is picked on its layer and dragged with the pointer', () => {
    s().setOrbit(40, 20);
    const start = partPoint();
    const before = { x: part().x, y: part().y };
    g.down(ptr(start));
    expect(g.current.kind).toBe('part');
    g.move(ptr(add(start, 20, 10)));
    g.end(1, true);
    expect({ x: part().x, y: part().y }).not.toEqual(before);
    // The part's middle followed the pointer.
    const now = partPoint();
    expect(now.x).toBeCloseTo(start.x + 20, 3);
    expect(now.y).toBeCloseTo(start.y + 10, 3);
  });

  it('middle button pans the view without an undo entry', () => {
    expect(g.down(ptr({ x: 10, y: 10 }, { button: 1 }))).toEqual({ tracked: true, preventDefault: true });
    expect(g.current.kind).toBe('pan');
    g.move(ptr({ x: 30, y: 5 }));
    expect(s().view).toEqual({ x: 20, y: -5, zoom: 1 });
    g.end(1, true);
    expect(g.current.kind).toBe('idle');
    expect(history()).toBe(0);
  });

  it('Space + left button pans and marks the Space press as panned', () => {
    s().setSpaceHeld(true);
    g.down(ptr(partPoint()));
    expect(g.current.kind).toBe('pan');
    expect(s().spacePanned).toBe(true);
    expect(s().transaction).toBeNull();
  });

  it('setup: a part drag starts past the threshold and commits one undo entry', () => {
    const start = partPoint();
    const before = { x: part().x, y: part().y };
    g.down(ptr(start));
    expect(g.current.kind).toBe('part');
    expect(s().selectedPartId).toBe(part().id);
    expect(s().transaction).not.toBeNull();
    g.move(ptr(add(start, DRAG_THRESHOLD_PX - 1)));
    expect({ x: part().x, y: part().y }).toEqual(before);
    g.move(ptr(add(start, 20, 10)));
    expect({ x: part().x, y: part().y }).not.toEqual(before);
    g.end(1, true);
    expect(g.current.kind).toBe('idle');
    expect(s().transaction).toBeNull();
    expect(history()).toBe(1);
  });

  it('drops a part drag whose transaction vanished (project loaded mid-drag)', () => {
    const start = partPoint();
    g.down(ptr(start));
    expect(g.current.kind).toBe('part');
    s().loadProject(s().project);
    expect(s().transaction).toBeNull();
    const before = s().project;
    g.move(ptr(add(start, 40)));
    expect(g.current.kind).toBe('idle');
    expect(s().project).toBe(before);
    expect(history()).toBe(0);
  });

  it('a cancelled part drag restores the project without an undo entry', () => {
    const start = partPoint();
    const before = s().project;
    g.down(ptr(start));
    g.move(ptr(add(start, 40)));
    g.end(1, false);
    expect(s().project).toBe(before);
    expect(history()).toBe(0);
  });

  it('pressing on empty space selects nothing and stays idle', () => {
    s().select('head');
    expect(g.down(ptr({ x: 2, y: 2 }))).toEqual({ tracked: true, preventDefault: false });
    expect(g.current.kind).toBe('idle');
    expect(s().selectedBoneId).toBeNull();
  });

  it('a second finger cancels the drag and pinches; lifting a finger ends the pinch', () => {
    const start = partPoint();
    const before = s().project;
    g.down(ptr(start, { pointerType: 'touch' }));
    g.move(ptr(add(start, 30), { pointerType: 'touch' }));
    g.down(ptr(add(start, 100), { pointerId: 2, pointerType: 'touch' }));
    expect(g.current.kind).toBe('pinch');
    expect(s().project).toBe(before);
    expect(s().transaction).toBeNull();
    // A third finger is tracked but ignored.
    g.down(ptr({ x: 5, y: 5 }, { pointerId: 3, pointerType: 'touch' }));
    expect(g.current.kind).toBe('pinch');
    g.move(ptr(add(start, 200), { pointerId: 2, pointerType: 'touch' }));
    expect(s().view.zoom).toBeGreaterThan(1);
    g.end(1, true);
    expect(g.current.kind).toBe('idle');
    const v = s().view;
    g.move(ptr(add(start, 300), { pointerId: 2, pointerType: 'touch' }));
    expect(s().view).toBe(v);
    expect(history()).toBe(0);
  });

  it('animate: dragging a bone poses it as one undo entry', () => {
    s().setMode('animate');
    s().addAnimation('a');
    s().setView({ x: 0, y: 0, zoom: 4 });
    useEditor.temporal.getState().clear();
    const start = bonePoint('head');
    g.down(ptr(start));
    expect(g.current.kind).toBe('pose');
    expect(s().selectedBoneId).toBe('head');
    g.move(ptr(add(start, 30, 40)));
    g.move(ptr(add(start, 40, 60)));
    g.end(1, true);
    const anim = s().project.animations[0];
    expect(anim.tracks.head?.rotation?.length).toBe(1);
    expect(history()).toBe(1);
  });

  it('a hidden rig is not clickable; its sprites still are', () => {
    s().toggleRig();
    s().setView({ x: 0, y: 0, zoom: 4 });
    s().select('torso');
    g.down(ptr(bonePoint('head')));
    expect(s().selectedBoneId).toBeNull();
    g.end(1, true);
    s().setMode('animate');
    s().addAnimation('a');
    g.down(ptr(bonePoint('head')));
    expect(g.current.kind).toBe('idle');
    g.end(1, true);
    g.down(ptr(partPoint()));
    expect(g.current.kind).toBe('pose');
    expect(s().selectedBoneId).toBe('lowerArm_L');
    g.end(1, true);
  });

  it('animate without an animation only selects', () => {
    s().setMode('animate');
    s().setView({ x: 0, y: 0, zoom: 4 });
    g.down(ptr(bonePoint('head')));
    expect(s().selectedBoneId).toBe('head');
    expect(g.current.kind).toBe('idle');
  });

  it('window blur and dispose commit a running drag', () => {
    const start = partPoint();
    g.down(ptr(start));
    g.move(ptr(add(start, 40)));
    g.blur();
    expect(g.current.kind).toBe('idle');
    expect(history()).toBe(1);
    // The pointer was forgotten: its later events do nothing.
    g.move(ptr(add(start, 80)));
    g.end(1, true);
    expect(history()).toBe(1);

    const again = partPoint();
    g.down(ptr(again));
    g.move(ptr(add(again, 40)));
    g.dispose();
    expect(history()).toBe(2);
  });
});

describe('tilt handle drag', () => {
  const handleOf = (id: string) =>
    tiltHandleScreenPos(view(), frame(s()).world[id], boneById(s().project.rig, id)!);
  const tiltKeys = () => s().project.animations[0].tracks.thigh_L?.tilt ?? [];

  beforeEach(() => {
    s().addAnimation('walk');
    s().setMode('animate');
    s().select('thigh_L');
    useEditor.temporal.getState().clear();
  });

  it('dragging the handle along the bone sets tilt and is one undo step', () => {
    const start = handleOf('thigh_L');
    const dir = boneScreenDir(view(), frame(s()).world.thigh_L, boneById(s().project.rig, 'thigh_L')!);
    g.down(ptr(start));
    expect(g.current.kind).toBe('tilt');
    g.move(ptr(add(start, dir.x * 30, dir.y * 30)));
    g.move(ptr(add(start, dir.x * 50, dir.y * 50)));
    g.end(1, true);
    expect(tiltKeys()).toEqual([{ frame: 0, value: tiltFromDrag(0, 50), easing: 'linear' }]);
    expect(history()).toBe(1);
    expect(s().selectedBoneId).toBe('thigh_L');
  });

  it('a second finger cancels the tilt without a key or undo entry', () => {
    const start = handleOf('thigh_L');
    g.down(ptr(start));
    g.move(ptr(add(start, 0, 40)));
    g.down(ptr({ x: 5, y: 5 }, { pointerId: 2, pointerType: 'touch' }));
    expect(g.current.kind).toBe('pinch');
    expect(tiltKeys()).toEqual([]);
    expect(history()).toBe(0);
  });

  it('is not available while the project is locked', () => {
    s().setSettings({ depthLocked: true });
    useEditor.temporal.getState().clear();
    g.down(ptr(handleOf('thigh_L')));
    expect(g.current.kind).not.toBe('tilt');
    g.end(1, true);
    expect(tiltKeys()).toEqual([]);
  });

  it('is not available in setup mode', () => {
    s().setMode('setup');
    g.down(ptr(handleOf('thigh_L')));
    expect(g.current.kind).not.toBe('tilt');
  });
});
