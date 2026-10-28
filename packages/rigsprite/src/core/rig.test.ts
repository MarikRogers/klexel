import { describe, expect, it } from 'vitest';
import { boneById, boneTip, computeWorldTransforms, descendantIds, getRestPose, rigHeight, sanitizeBonePatch, type Bone, type Rig } from './rig';
import { invert } from './math';

const a: Bone = { id: 'a', name: 'a', parentId: null, x: 0, y: 0, rotation: 0, length: 10, softness: 4 };
const b: Bone = { id: 'b', name: 'b', parentId: 'a', x: 10, y: 0, rotation: 0, length: 10, softness: 4 };
const rig: Rig = { bones: [a, b] };

describe('rig FK', () => {
  it('child tip follows parent rotation', () => {
    const world = computeWorldTransforms(rig, { a: { rotation: 90 } });
    const tip = boneTip(world.b, b);
    expect(tip.x).toBeCloseTo(0);
    expect(tip.y).toBeCloseTo(20);
  });

  it('bones listed child-before-parent still resolve', () => {
    const reversed: Rig = { bones: [b, a] };
    const pose = { a: { rotation: 33 } };
    expect(computeWorldTransforms(reversed, pose)).toEqual(computeWorldTransforms(rig, pose));
  });

  it('pose for unknown bone is ignored', () => {
    expect(computeWorldTransforms(rig, { ghost: { rotation: 45 } })).toEqual(computeWorldTransforms(rig));
  });

  it('descendantIds includes the bone and its descendants', () => {
    expect(descendantIds(rig, 'a')).toEqual(['a', 'b']);
  });

  it('rigHeight of a rig with root rotated 90 is 20', () => {
    const rotated: Rig = { bones: [{ ...a, rotation: 90 }, b] };
    expect(rigHeight(rotated)).toBeCloseTo(20);
  });
});

describe('boneById', () => {
  it('finds a bone, and returns undefined for unknown or missing ids', () => {
    expect(boneById(rig, 'b')).toBe(b);
    expect(boneById(rig, 'zzz')).toBeUndefined();
    expect(boneById(rig, null)).toBeUndefined();
  });
});

describe('sanitizeBonePatch', () => {
  it('clamps length >= 1 and softness >= 0, passes other fields', () => {
    expect(sanitizeBonePatch({ length: -5, softness: -3, name: 'n' })).toEqual({ length: 1, softness: 0, name: 'n' });
    expect(sanitizeBonePatch({ length: 7.5, softness: 2 })).toEqual({ length: 7.5, softness: 2 });
    expect(sanitizeBonePatch({ x: 3 })).toEqual({ x: 3 });
  });
});

describe('getRestPose', () => {
  const rig: Rig = {
    bones: [
      { id: 'a', name: 'a', parentId: null, x: 3, y: 4, rotation: 30, length: 10, softness: 2 },
      { id: 'b', name: 'b', parentId: 'a', x: 10, y: 0, rotation: -45, length: 10, softness: 2 },
    ],
  };

  it('is the rest world transforms and their inverses', () => {
    const { restWorld, restInverse } = getRestPose(rig);
    expect(restWorld).toEqual(computeWorldTransforms(rig));
    for (const id of ['a', 'b']) expect(restInverse[id]).toEqual(invert(restWorld[id]));
  });

  it('is cached per rig object and recomputed for a new rig', () => {
    const first = getRestPose(rig);
    expect(getRestPose(rig)).toBe(first);
    const edited: Rig = { bones: rig.bones.map((b) => (b.id === 'a' ? { ...b, rotation: 0 } : b)) };
    const second = getRestPose(edited);
    expect(second).not.toBe(first);
    expect(second.restWorld).toEqual(computeWorldTransforms(edited));
    expect(second.restWorld.b).not.toEqual(first.restWorld.b);
  });
});
