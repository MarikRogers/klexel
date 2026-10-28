import { describe, expect, it } from 'vitest';
import { defaultSoftness, rigHeight } from '../rig';
import { RIG_TEMPLATES } from './rigs';

describe.each(RIG_TEMPLATES)('rig template $id', (tpl) => {
  const { bones } = tpl.rig;
  const ids = new Set(bones.map((b) => b.id));

  it('is structurally valid', () => {
    expect(bones.filter((b) => b.parentId === null)).toHaveLength(1);
    for (const b of bones) {
      if (b.parentId !== null) expect(ids.has(b.parentId)).toBe(true);
      expect(b.id).toBe(b.name);
      expect(b.length).toBeGreaterThan(0);
      expect(b.softness).toBe(defaultSoftness(b.length));
    }
    expect(new Set(bones.map((b) => b.name)).size).toBe(bones.length);
    expect(ids.size).toBe(bones.length);
  });

  it('has no cycles', () => {
    const byId = new Map(bones.map((b) => [b.id, b]));
    for (const b of bones) {
      let cur: typeof b | undefined = b;
      let steps = 0;
      while (cur && cur.parentId !== null) {
        cur = byId.get(cur.parentId);
        expect(++steps).toBeLessThanOrEqual(bones.length);
      }
    }
  });
});

describe('humanoid', () => {
  const tpl = RIG_TEMPLATES.find((t) => t.id === 'humanoid')!;
  it('has expected height and bones', () => {
    const h = rigHeight(tpl.rig);
    expect(h).toBeGreaterThanOrEqual(110);
    expect(h).toBeLessThanOrEqual(135);
    expect(tpl.rig.bones.map((b) => b.name).sort()).toEqual(
      ['hip', 'torso', 'head', 'upperArm_L', 'lowerArm_L', 'hand_L', 'upperArm_R', 'lowerArm_R', 'hand_R',
        'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'].sort(),
    );
  });
});

describe('quadruped', () => {
  const tpl = RIG_TEMPLATES.find((t) => t.id === 'quadruped')!;
  it('has expected bones', () => {
    const names = tpl.rig.bones.map((b) => b.name);
    const expected = ['body', 'neck', 'head', 'tail1', 'tail2'];
    for (const p of ['frontUpper_', 'frontLower_', 'backUpper_', 'backLower_'])
      for (const s of ['L', 'R']) expected.push(p + s);
    for (const n of expected) expect(names).toContain(n);
  });
});
