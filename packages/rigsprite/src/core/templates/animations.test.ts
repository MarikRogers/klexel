import { describe, expect, it } from 'vitest';
import { ANIMATION_TEMPLATES, applyAnimationTemplate } from './animations';
import { RIG_TEMPLATES } from './rigs';
import { sampleChannel } from '../animation';
import type { Rig } from '../rig';

const rigOf = (id: string) => RIG_TEMPLATES.find((r) => r.id === id)!.rig;
const tpl = (id: string) => ANIMATION_TEMPLATES.find((t) => t.id === id)!;

describe('animation templates', () => {
  it('provides the expected templates', () => {
    expect(ANIMATION_TEMPLATES.map((t) => t.id)).toEqual([
      'humanoid-idle', 'humanoid-walk', 'humanoid-run', 'humanoid-jump', 'humanoid-punch',
      'quadruped-idle', 'quadruped-walk',
    ]);
    expect(tpl('humanoid-walk').name).toBe('walk');
  });

  it('every template only references bones of its rig template', () => {
    for (const t of ANIMATION_TEMPLATES) {
      const names = new Set(rigOf(t.rigTemplateId).bones.map((b) => b.name));
      for (const bone of Object.keys(t.tracks)) expect(names.has(bone), `${t.id}:${bone}`).toBe(true);
    }
  });

  it('keys are sorted and within the animation length', () => {
    for (const t of ANIMATION_TEMPLATES)
      for (const track of Object.values(t.tracks))
        for (const keys of Object.values(track)) {
          const frames = keys!.map((k) => k.frame);
          expect(frames).toEqual([...frames].sort((a, b) => a - b));
          expect(frames[0]).toBeGreaterThanOrEqual(0);
          expect(frames[frames.length - 1]).toBeLessThanOrEqual(t.length);
        }
  });

  it('loop templates are seamless', () => {
    for (const t of ANIMATION_TEMPLATES.filter((x) => x.loop))
      for (const [bone, track] of Object.entries(t.tracks))
        for (const [ch, keys] of Object.entries(track)) {
          const first = keys!.find((k) => k.frame === 0);
          const last = keys!.find((k) => k.frame === t.length);
          expect(first, `${t.id}:${bone}.${ch} @0`).toBeDefined();
          expect(last, `${t.id}:${bone}.${ch} @end`).toBeDefined();
          expect(last!.value).toBeCloseTo(first!.value, 6);
        }
  });

  it('walk swings legs in opposition', () => {
    const t = tpl('humanoid-walk');
    const l = sampleChannel(t.tracks.thigh_L.rotation!, 0, 0);
    const r = sampleChannel(t.tracks.thigh_R.rotation!, 0, 0);
    expect(Math.sign(l)).toBe(-Math.sign(r));
    expect(Math.abs(l)).toBeGreaterThan(0);
  });

  it('quadruped walk moves diagonal legs together', () => {
    const t = tpl('quadruped-walk');
    for (const f of [0, 3, 5, 8, 11]) {
      const a = sampleChannel(t.tracks.frontUpper_L.rotation!, f, 0);
      const b = sampleChannel(t.tracks.backUpper_R.rotation!, f, 0);
      expect(a).toBeCloseTo(b, 6);
    }
  });

  it('apply drops unknown bones and scales translation', () => {
    const base = rigOf('humanoid');
    const doubled: Rig = {
      bones: base.bones
        .filter((b) => b.name !== 'hand_L')
        .map((b) => ({ ...b, x: b.x * 2, y: b.y * 2, length: b.length * 2 })),
    };
    const t = tpl('humanoid-walk');
    const anim = applyAnimationTemplate(t, doubled);
    expect(anim.tracks['hand_L']).toBeUndefined();
    expect(anim.name).toBe('walk');
    expect(anim.id).toBeTruthy();
    const orig = t.tracks.hip.y!;
    const scaled = anim.tracks['hip'].y!;
    expect(scaled).toHaveLength(orig.length);
    orig.forEach((k, i) => expect(scaled[i].value).toBeCloseTo(k.value * 2, 6));
    // rotation untouched
    expect(anim.tracks['thigh_L'].rotation![0].value).toBe(t.tracks.thigh_L.rotation![0].value);
  });

  it('apply maps template bone names to rig ids when id differs from name', () => {
    const base = rigOf('humanoid');
    const renamedIds: Rig = {
      bones: base.bones.map((b) => ({
        ...b,
        id: `id-${b.id}`,
        parentId: b.parentId === null ? null : `id-${b.parentId}`,
      })),
    };
    const t = tpl('humanoid-walk');
    const anim = applyAnimationTemplate(t, renamedIds);
    const thighId = renamedIds.bones.find((b) => b.name === 'thigh_L')!.id;
    expect(thighId).toBe('id-thigh_L');
    expect(anim.tracks[thighId]).toBeDefined();
    expect(anim.tracks['thigh_L']).toBeUndefined();
    expect(anim.tracks[thighId].rotation).toEqual(t.tracks.thigh_L.rotation);
  });

  it('apply keeps translation unscaled when the target rig has zero height', () => {
    const flat: Rig = {
      bones: [{ id: 'hip', name: 'hip', parentId: null, x: 0, y: 0, rotation: 0, length: 10, softness: 4 }],
    };
    const t = tpl('humanoid-walk');
    const anim = applyAnimationTemplate(t, flat);
    expect(anim.tracks['hip'].y).toEqual(t.tracks.hip.y);
  });
});
