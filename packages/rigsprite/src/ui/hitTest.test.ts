import { describe, expect, it } from 'vitest';
import type { DrawItem } from '../core/frame';
import type { Vec2 } from '../core/math';
import { computeWorldTransforms, type Bone, type Rig } from '../core/rig';
import { orderLayers } from '../render/layers';
import { screenToWorld, worldToScreen, type ViewTransform } from '../render/view';
import { hitTestBone, hitTestPart } from './hitTest';

const bone = (id: string, x: number, y: number, rotation: number, length: number): Bone => ({
  id,
  name: id,
  parentId: null,
  x,
  y,
  rotation,
  length,
  softness: 4,
});

// "a" runs along +x from (0,0) to (100,0); "b" runs down from (0,20) to (0,120).
const rig: Rig = { bones: [bone('a', 0, 0, 0, 100), bone('b', 0, 20, 90, 100)] };
const world = computeWorldTransforms(rig);

const quad = (partId: string, x0: number, y0: number, x1: number, y1: number, z: number): DrawItem => ({
  partId,
  imageId: 'img',
  positions: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  z,
});

describe('hitTestBone', () => {
  it('returns the bone whose segment is nearest within tolerance', () => {
    expect(hitTestBone(rig, world, { x: 50, y: 3 }, 5)).toBe('a');
    expect(hitTestBone(rig, world, { x: 2, y: 60 }, 5)).toBe('b');
  });

  it('prefers the closer bone when several are within tolerance', () => {
    // distance to a = 9, distance to b (segment starts at y=20) = hypot(3, 11) ≈ 11.4
    expect(hitTestBone(rig, world, { x: 3, y: 9 }, 15)).toBe('a');
    // distance to a = 15, distance to b = 3
    expect(hitTestBone(rig, world, { x: 3, y: 15 }, 20)).toBe('b');
  });

  it('measures distance to the segment, not the infinite line', () => {
    expect(hitTestBone(rig, world, { x: 108, y: 0 }, 5)).toBeNull();
    expect(hitTestBone(rig, world, { x: 104, y: 0 }, 5)).toBe('a');
  });

  it('returns null outside the tolerance', () => {
    expect(hitTestBone(rig, world, { x: 50, y: 50 }, 5)).toBeNull();
  });
});

describe('hitTestPart', () => {
  const view = (yaw: number, pitch = 0): ViewTransform => ({
    x: 0, y: 0, zoom: 1, rotation: 0, yaw, pitch, mirror: false, width: 200, height: 200,
  });
  const items = [quad('low', 0, 0, 100, 100, 0), quad('high', 50, 50, 150, 150, 1)];
  const at = (v: ViewTransform, p: Vec2) => worldToScreen(v, p);

  it('front view: the part drawn last (higher z) wins where parts overlap', () => {
    const v = view(0);
    expect(hitTestPart(orderLayers(items, v, 12), v, at(v, { x: 75, y: 75 }))).toBe('high');
  });

  it('back view: the layers are drawn reversed, so the lower z wins', () => {
    const v = view(180);
    expect(hitTestPart(orderLayers(items, v, 12), v, at(v, { x: 75, y: 75 }))).toBe('low');
  });

  it('returns the only part containing the point, null outside all parts', () => {
    const v = view(0);
    const layers = orderLayers(items, v, 12);
    expect(hitTestPart(layers, v, at(v, { x: 25, y: 25 }))).toBe('low');
    expect(hitTestPart(layers, v, at(v, { x: 140, y: 140 }))).toBe('high');
    expect(hitTestPart(layers, v, at(v, { x: 200, y: 10 }))).toBeNull();
    expect(hitTestPart([], v, { x: 0, y: 0 })).toBeNull();
  });

  it('orbited view: projects the pointer back onto each layer', () => {
    const v = view(40, 20);
    const small = [quad('back', 0, 0, 10, 10, 0), quad('front', 0, 0, 10, 10, 1)];
    const layers = orderLayers(small, v, 100);
    // Middle of "front" (depth +50) on screen: only the depth offset moves it there.
    const p = worldToScreen(v, { x: 5, y: 5 }, 50);
    const flat = screenToWorld(v, p);
    expect(flat.x < 0 || flat.x > 10 || flat.y < 0 || flat.y > 10).toBe(true);
    expect(hitTestPart(layers, v, p)).toBe('front');
    expect(hitTestPart(layers, v, worldToScreen(v, { x: 5, y: 5 }, -50))).toBe('back');
  });
});
