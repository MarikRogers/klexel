import { describe, expect, it } from 'vitest';
import { createAnimation, setKey } from '../core/animation';
import { buildFrame } from '../core/frame';
import { autoFitPart } from '../core/part';
import { createProject, toFrameInput, type Project } from '../core/project';
import { makeImageAsset, makePart } from '../test/fixtures';
import { createFrameCache, type FrameState } from './viewportFrame';

function project(): Project {
  const p = createProject('humanoid');
  const bone = p.rig.bones.find((b) => b.id === 'lowerArm_L')!;
  const image = makeImageAsset();
  const anim = setKey(createAnimation('walk'), 'lowerArm_L', 'rotation', { frame: 4, value: 60, easing: 'linear' });
  return {
    ...p,
    images: { [image.id]: image },
    parts: [makePart({ boneId: bone.id, ...autoFitPart(image, bone) })],
    animations: [anim],
  };
}

function state(over: Partial<FrameState> = {}): FrameState {
  const p = over.project ?? project();
  return { project: p, mode: 'animate', animationId: p.animations[0].id, frame: 2, ...over };
}

describe('createFrameCache', () => {
  it('builds the same frame as buildFrame', () => {
    const s = state();
    expect(createFrameCache()(s)).toEqual(buildFrame(toFrameInput(s.project, s.animationId), s.frame));
  });

  it('returns the cached frame while its inputs are unchanged (view / selection changes)', () => {
    const frameOf = createFrameCache();
    const s = state();
    const a = frameOf(s);
    // A new state object with the same project slices, e.g. after setView or select.
    expect(frameOf({ ...s })).toBe(a);
    expect(frameOf({ ...s, project: { ...s.project, name: 'renamed' } })).toBe(a);
  });

  it('rebuilds on frame, animation, mode, part, rig or image changes', () => {
    const frameOf = createFrameCache();
    const s = state();
    let last = frameOf(s);
    const expectRebuild = (next: FrameState) => {
      const f = frameOf(next);
      expect(f).not.toBe(last);
      expect(f).toEqual(buildFrame(toFrameInput(next.project, next.mode === 'animate' ? next.animationId : null), next.frame));
      last = f;
    };
    expectRebuild({ ...s, frame: 3 });
    expectRebuild({ ...s, frame: 3, mode: 'setup' });
    const anim = s.project.animations[0];
    const edited = setKey(anim, 'lowerArm_L', 'rotation', { frame: 0, value: -30, easing: 'linear' });
    const p2 = { ...s.project, animations: [edited] };
    expectRebuild({ ...s, project: p2, frame: 3 });
    const p3 = { ...p2, parts: [{ ...p2.parts[0], x: p2.parts[0].x + 5 }] };
    expectRebuild({ ...s, project: p3, frame: 3 });
    const p4 = { ...p3, rig: { bones: p3.rig.bones.map((b) => (b.id === 'torso' ? { ...b, rotation: 10 } : b)) } };
    expectRebuild({ ...s, project: p4, frame: 3 });
    const p5 = { ...p4, images: { img: { ...p4.images.img, width: 40 } } };
    expectRebuild({ ...s, project: p5, frame: 3 });
  });
});
