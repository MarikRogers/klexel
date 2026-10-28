import { describe, expect, it } from 'vitest';
import type { Bone, Rig } from '../core/rig';
import { rotationOffsetToward, translationOffsetToward } from './posing';

const a: Bone = { id: 'a', name: 'a', parentId: null, x: 0, y: 0, rotation: 0, length: 10, softness: 4 };
const b: Bone = { id: 'b', name: 'b', parentId: 'a', x: 10, y: 0, rotation: 0, length: 10, softness: 4 };
const rig: Rig = { bones: [a, b] };

describe('rotationOffsetToward', () => {
  it('points the bone at the target from the rest pose', () => {
    expect(rotationOffsetToward(rig, {}, 'b', { x: 10, y: 10 })).toBeCloseTo(90);
  });
  it('accounts for the posed parent', () => {
    expect(rotationOffsetToward(rig, { a: { rotation: 90 } }, 'b', { x: -10, y: 10 })).toBeCloseTo(90);
  });
  it('adds to the current offset', () => {
    // b already rotated 90 by its own offset; target straight along +x from its origin -> offset 0
    expect(rotationOffsetToward(rig, { b: { rotation: 90 } }, 'b', { x: 30, y: 0 })).toBeCloseTo(0);
  });
});

describe('translationOffsetToward', () => {
  it('root has no parent space', () => {
    const rotated: Rig = { bones: [{ ...a, rotation: 90 }, b] };
    const o = translationOffsetToward(rotated, {}, 'a', { x: 0, y: 5 });
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(5);
  });
  it('converts a world delta into the parent space', () => {
    const rotated: Rig = { bones: [{ ...a, rotation: 90 }, b] };
    const o = translationOffsetToward(rotated, {}, 'b', { x: 0, y: 5 });
    expect(o.x).toBeCloseTo(5);
    expect(o.y).toBeCloseTo(0);
  });
  it('adds to the current offset', () => {
    const o = translationOffsetToward(rig, { b: { x: 2, y: 3 } }, 'b', { x: 1, y: 1 });
    expect(o).toEqual({ x: 3, y: 4 });
  });
});
