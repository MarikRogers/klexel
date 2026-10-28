import { describe, expect, it } from 'vitest';
import {
  boneById,
  boneTip,
  computeWorldTransforms,
  computeWorldTransforms3D,
  descendantIds,
  getRestPose,
  poseUsesDepth,
  rigHeight,
  sanitizeBonePatch,
  type Bone,
  type Rig,
} from './rig';
import { invert } from './math';
import { applyToPoint3, projectTo2D } from './math3d';
import { RIG_TEMPLATES } from './templates/rigs';

describe('rig FK in 3D', () => {
  it('without a pose the projected 3D chain equals the 2D chain bit for bit', () => {
    for (const t of RIG_TEMPLATES) {
      const w2 = computeWorldTransforms(t.rig);
      const w3 = computeWorldTransforms3D(t.rig, {});
      for (const bone of t.rig.bones) expect(projectTo2D(w3[bone.id])).toEqual(w2[bone.id]);
    }
  });

  it('a child follows its tilted parent: the child origin comes forward', () => {
    const down: Rig = {
      bones: [
        { id: 'a', name: 'a', parentId: null, x: 0, y: 0, rotation: 90, length: 10, softness: 4 },
        { id: 'b', name: 'b', parentId: 'a', x: 10, y: 0, rotation: 0, length: 10, softness: 4 },
      ],
    };
    const w = computeWorldTransforms3D(down, { a: { tilt: 60 } });
    const origin = applyToPoint3(w.b, { x: 0, y: 0, z: 0 });
    expect(origin.y).toBeCloseTo(5, 9);
    expect(origin.z).toBeCloseTo(10 * Math.sin((60 * Math.PI) / 180), 9);
  });

  it('depth of a bone moves it and its children along z', () => {
    const w = computeWorldTransforms3D(rig, { a: { depth: 7 } });
    expect(applyToPoint3(w.b, { x: 0, y: 0, z: 0 }).z).toBe(7);
  });

  it('poseUsesDepth is true only for a non-zero tilt, turn or depth', () => {
    expect(poseUsesDepth({})).toBe(false);
    expect(poseUsesDepth({ a: { rotation: 5, scaleX: 2 } })).toBe(false);
    expect(poseUsesDepth({ a: { depth: 0, tilt: 0 } })).toBe(false);
    expect(poseUsesDepth({ a: { tilt: 1 } })).toBe(true);
    expect(poseUsesDepth({ b: { turn: -1 } })).toBe(true);
    expect(poseUsesDepth({ b: { depth: 2 } })).toBe(true);
  });
});

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
    expect(sanitizeBonePatch({ thickness: 0 })).toEqual({ thickness: 1 });
    expect(sanitizeBonePatch({ thickness: 12 })).toEqual({ thickness: 12 });
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
