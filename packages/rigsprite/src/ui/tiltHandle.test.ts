import { describe, expect, it } from 'vitest';
import type { Mat2D } from '../core/math';
import type { Bone } from '../core/rig';
import type { ViewTransform } from '../render/view';
import { hitTestTiltHandle, tiltFromDrag, tiltHandleScreenPos, boneScreenDir } from './tiltHandle';

const view: ViewTransform = { x: 0, y: 0, zoom: 1, rotation: 0, yaw: 0, pitch: 0, mirror: false, width: 800, height: 600 };
const bone: Bone = { id: 'a', name: 'a', parentId: null, x: 0, y: 0, rotation: 0, length: 100, softness: 4 };
const world: Mat2D = [1, 0, 0, 1, 0, 0];

describe('tilt handle', () => {
  it('sits beside the middle of the bone, 28 px off to the side', () => {
    const h = tiltHandleScreenPos(view, world, bone);
    expect(h.x).toBeCloseTo(450);
    expect(h.y).toBeCloseTo(272);
  });

  it('follows the bone direction and falls back for a bone without screen length', () => {
    const down: Mat2D = [0, 1, -1, 0, 0, 0];
    const dir = boneScreenDir(view, down, bone);
    expect(dir.x).toBeCloseTo(0);
    expect(dir.y).toBeCloseTo(1);
    const flat = boneScreenDir(view, [0, 0, 0, 0, 0, 0], bone);
    expect(Math.hypot(flat.x, flat.y)).toBeCloseTo(1);
    expect(Number.isFinite(tiltHandleScreenPos(view, [0, 0, 0, 0, 0, 0], bone).x)).toBe(true);
  });

  it('is hit within 11 px by a mouse and within 22 px (44 px wide) by a finger', () => {
    const h = { x: 100, y: 100 };
    expect(hitTestTiltHandle({ x: 110, y: 100 }, h, 'mouse')).toBe(true);
    expect(hitTestTiltHandle({ x: 112, y: 100 }, h, 'mouse')).toBe(false);
    expect(hitTestTiltHandle({ x: 100, y: 120 }, h, 'touch')).toBe(true);
    expect(hitTestTiltHandle({ x: 100, y: 123 }, h, 'touch')).toBe(false);
  });

  it('tiltFromDrag adds 0.8 degrees per pixel and stays within ±85', () => {
    expect(tiltFromDrag(0, 50)).toBe(40);
    expect(tiltFromDrag(10, -20)).toBeCloseTo(-6);
    expect(tiltFromDrag(80, 100)).toBe(85);
    expect(tiltFromDrag(-80, -100)).toBe(-85);
  });
});
