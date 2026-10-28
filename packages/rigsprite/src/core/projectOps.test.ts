import { describe, expect, it } from 'vitest';
import { createAnimation, setKey } from './animation';
import { autoFitPart } from './part';
import { createProject } from './project';
import { addImagesAutoAttach, removeBoneCascade, withSpriteAxis } from './projectOps';
import { boneById } from './rig';
import { makeImageAsset, makePart } from '../test/fixtures';

describe('addImagesAutoAttach', () => {
  it('adds all images and attaches those whose file name matches a bone, stacked on top', () => {
    const p = createProject('humanoid');
    p.images.old = makeImageAsset({ id: 'old' });
    p.parts.push(makePart({ id: 'existing', imageId: 'old', boneId: 'hip', z: 4 }));
    const next = addImagesAutoAttach(p, [
      makeImageAsset({ id: 'i1', name: 'head.png' }),
      makeImageAsset({ id: 'i2', name: 'random.png' }),
      makeImageAsset({ id: 'i3', name: 'Torso.PNG' }),
    ]);
    expect(Object.keys(next.images)).toEqual(['old', 'i1', 'i2', 'i3']);
    expect(next.parts.map((x) => [x.imageId, x.boneId, x.z])).toEqual([
      ['old', 'hip', 4],
      ['i1', 'head', 5],
      ['i3', 'torso', 6],
    ]);
    expect(next.parts[1]).toMatchObject(autoFitPart(next.images.i1, boneById(p.rig, 'head')!, 'down'));
    expect(p.parts).toHaveLength(1);
  });
});

describe('removeBoneCascade', () => {
  it('removes the bone, its descendants, their parts and tracks', () => {
    const p = createProject('humanoid');
    p.parts.push(makePart({ id: 'arm', boneId: 'lowerArm_L' }), makePart({ id: 'head', boneId: 'head' }));
    let anim = setKey(createAnimation('a'), 'hand_L', 'rotation', { frame: 0, value: 1, easing: 'linear' });
    anim = setKey(anim, 'head', 'rotation', { frame: 0, value: 2, easing: 'linear' });
    p.animations.push(anim);
    const next = removeBoneCascade(p, 'upperArm_L');
    const names = next.rig.bones.map((b) => b.name);
    expect(names).not.toContain('upperArm_L');
    expect(names).not.toContain('lowerArm_L');
    expect(names).not.toContain('hand_L');
    expect(names).toContain('head');
    expect(next.parts.map((x) => x.id)).toEqual(['head']);
    expect(Object.keys(next.animations[0].tracks)).toEqual(['head']);
  });

  it('returns the project itself for the root or an unknown bone', () => {
    const p = createProject('humanoid');
    expect(removeBoneCascade(p, 'hip')).toBe(p);
    expect(removeBoneCascade(p, 'nope')).toBe(p);
  });
});

describe('withSpriteAxis', () => {
  it('refits every part and keeps z/visibility; same project when unchanged', () => {
    const p = createProject('humanoid');
    p.images.i = makeImageAsset({ id: 'i' });
    p.parts.push(makePart({ id: 'a', imageId: 'i', boneId: 'head', x: 99, z: 3, visible: false }));
    p.parts.push(makePart({ id: 'orphan', imageId: 'missing', boneId: 'head', x: 7 }));
    expect(withSpriteAxis(p, 'down')).toBe(p);
    const next = withSpriteAxis(p, 'right');
    expect(next.settings.spriteAxis).toBe('right');
    expect(next.parts[0]).toMatchObject({ ...autoFitPart(p.images.i, boneById(p.rig, 'head')!, 'right'), z: 3, visible: false });
    expect(next.parts[1]).toBe(p.parts[1]);
  });
});
