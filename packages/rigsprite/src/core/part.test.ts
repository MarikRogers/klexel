import { describe, expect, it } from 'vitest';
import { applyToPoint, fromTRS } from './math';
import { autoFitPart, makePart, nextZ } from './part';
import { makeImageAsset, makePart as fixturePart } from '../test/fixtures';
import type { Bone } from './rig';

const bone: Bone = { id: 'b', name: 'b', parentId: null, x: 0, y: 0, rotation: 0, length: 50, softness: 12 };

describe('autoFitPart', () => {
  it('down (default): tall and wide images both get rotation -90 and height along the bone', () => {
    for (const [w, h] of [
      [40, 120],
      [120, 40],
    ]) {
      const f = autoFitPart({ width: w, height: h }, bone);
      expect(f.rotation).toBe(-90);
      expect(f.x).toBe(25);
      expect(f.y).toBe(0);
      expect(h * f.scaleX).toBeCloseTo(60);
      expect(f.scaleY).toBeCloseTo(f.scaleX);
    }
  });

  it('down: image top edge centre lies nearer the bone start', () => {
    const f = autoFitPart({ width: 40, height: 120 }, bone, 'down');
    const top = applyToPoint(fromTRS(f.x, f.y, f.rotation, f.scaleX, f.scaleY), { x: 0, y: -60 });
    expect(top.x).toBeLessThan(25);
    expect(top.x).toBeCloseTo(25 - 30);
  });

  it('right / up / left rotations; extent is the image width for right and left', () => {
    const img = { width: 120, height: 40 };
    const r = autoFitPart(img, bone, 'right');
    expect(r.rotation).toBe(0);
    expect(120 * r.scaleX).toBeCloseTo(60);
    expect(autoFitPart(img, bone, 'up').rotation).toBe(90);
    const l = autoFitPart(img, bone, 'left');
    expect(l.rotation).toBe(180);
    expect(120 * l.scaleX).toBeCloseTo(60);
  });

  it('tiny and extreme images still fit', () => {
    for (const [w, h] of [
      [8, 8],
      [2000, 300],
      [300, 2000],
    ]) {
      const f = autoFitPart({ width: w, height: h }, bone, 'right');
      expect(Math.abs(w * f.scaleX - 60)).toBeLessThan(0.01);
      expect(Number.isFinite(f.scaleX) && f.scaleX > 0).toBe(true);
    }
  });
});

describe('nextZ / makePart', () => {
  it('nextZ is one above the highest z, 0 for no parts', () => {
    expect(nextZ([])).toBe(0);
    expect(nextZ([fixturePart({ z: 3 }), fixturePart({ z: -2 })])).toBe(4);
  });

  it('makePart creates a visible, auto-fitted part with a fresh id', () => {
    const image = makeImageAsset({ id: 'i', width: 10, height: 40 });
    const p = makePart(image, bone, 'right', 5);
    expect(p).toMatchObject({ imageId: 'i', boneId: 'b', z: 5, visible: true, ...autoFitPart(image, bone, 'right') });
    expect(p.id).toMatch(/\w/);
    expect(makePart(image, bone, 'right', 5).id).not.toBe(p.id);
  });
});
