import { describe, expect, it } from 'vitest';
import { boneOrigin, boneTip, computeWorldTransforms, defaultSoftness, rigHeight } from '../rig';
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

describe('front and back view templates', () => {
  const byId = (id: string) => RIG_TEMPLATES.find((t) => t.id === id)!;
  const namesOf = (id: string) => byId(id).rig.bones.map((b) => b.name).sort();
  const worldOrigin = (id: string, bone: string) => {
    const world = computeWorldTransforms(byId(id).rig);
    return boneOrigin(world[bone]);
  };
  const worldTip = (id: string, bone: string) => {
    const rig = byId(id).rig;
    const world = computeWorldTransforms(rig);
    return boneTip(world[bone], rig.bones.find((b) => b.id === bone)!);
  };
  const pairs = (id: string) =>
    byId(id)
      .rig.bones.filter((b) => b.name.endsWith('_L'))
      .map((b) => [b.name, b.name.replace(/_L$/, '_R')] as const);

  it('keeps the side templates and adds the four views with German names', () => {
    expect(RIG_TEMPLATES.map((t) => [t.id, t.name])).toEqual([
      ['humanoid', 'Humanoid'],
      ['quadruped', 'Vierbeiner'],
      ['humanoid-front', 'Humanoid – Vorderansicht'],
      ['humanoid-back', 'Humanoid – Rückansicht'],
      ['quadruped-front', 'Vierbeiner – Vorderansicht'],
      ['quadruped-back', 'Vierbeiner – Rückansicht'],
    ]);
  });

  it.each([
    ['humanoid-front', 'humanoid'],
    ['humanoid-back', 'humanoid'],
    ['quadruped-front', 'quadruped'],
    ['quadruped-back', 'quadruped'],
  ])('%s uses exactly the bone names of %s', (view, side) => {
    expect(namesOf(view)).toEqual(namesOf(side));
  });

  it.each(['humanoid-front', 'humanoid-back'])('%s has the height band of the side humanoid', (id) => {
    const h = rigHeight(byId(id).rig);
    expect(h).toBeGreaterThanOrEqual(110);
    expect(h).toBeLessThanOrEqual(135);
  });

  it.each(['quadruped-front', 'quadruped-back'])('%s has a sensible height', (id) => {
    const h = rigHeight(byId(id).rig);
    expect(h).toBeGreaterThanOrEqual(60);
    expect(h).toBeLessThanOrEqual(100);
  });

  it.each([
    ['humanoid-front', 1],
    ['humanoid-back', -1],
    ['quadruped-front', 1],
    ['quadruped-back', -1],
  ])('%s: the character\'s left side is on screen side %i, mirror-symmetric', (id, side) => {
    for (const [l, r] of pairs(id)) {
      for (const at of [worldOrigin, worldTip]) {
        const pl = at(id, l);
        const pr = at(id, r);
        expect(Math.sign(pl.x), `${l}`).toBe(side);
        expect(Math.sign(pr.x), `${r}`).toBe(-side);
        expect(pl.x).toBeCloseTo(-pr.x, 6);
        expect(pl.y).toBeCloseTo(pr.y, 6);
      }
    }
  });

  it.each(['humanoid-front', 'humanoid-back'])('%s: root at the origin pointing up, limbs hang down', (id) => {
    const hip = byId(id).rig.bones.find((b) => b.name === 'hip')!;
    expect([hip.parentId, hip.x, hip.y, hip.rotation]).toEqual([null, 0, 0, -90]);
    expect(worldTip(id, 'head').y).toBeLessThan(-50);
    expect(worldTip(id, 'hand_L').y).toBeGreaterThan(worldOrigin(id, 'upperArm_L').y);
    expect(worldTip(id, 'foot_L').y).toBeGreaterThan(50);
    expect(Math.abs(worldOrigin(id, 'upperArm_L').x)).toBeCloseTo(15, 6);
    expect(Math.abs(worldOrigin(id, 'thigh_L').x)).toBeCloseTo(7, 6);
  });

  it('quadruped views: nearer leg pair is wider and lower, tail is a stub in the back view', () => {
    const w = (id: string, b: string) => worldOrigin(id, b);
    expect(Math.abs(w('quadruped-front', 'frontUpper_L').x)).toBeGreaterThan(Math.abs(w('quadruped-front', 'backUpper_L').x));
    expect(w('quadruped-front', 'frontUpper_L').y).toBeGreaterThan(w('quadruped-front', 'backUpper_L').y);
    expect(Math.abs(w('quadruped-back', 'backUpper_L').x)).toBeGreaterThan(Math.abs(w('quadruped-back', 'frontUpper_L').x));
    expect(w('quadruped-back', 'backUpper_L').y).toBeGreaterThan(w('quadruped-back', 'frontUpper_L').y);
    const tail = worldTip('quadruped-back', 'tail2');
    expect(Math.abs(tail.x)).toBeLessThan(5);
    expect(tail.y).toBeLessThan(0);
  });
});

describe('front and back view chains are gapless', () => {
  // Deliberately attached elsewhere than the parent's tip: shoulders (torso at 30 of 34, offset sideways), hips and
  // legs (sideways from the root's origin) and the tail (from the middle of the body).
  const ATTACHED_ELSEWHERE = new Set([
    'upperArm_L', 'upperArm_R', 'thigh_L', 'thigh_R',
    'frontUpper_L', 'frontUpper_R', 'backUpper_L', 'backUpper_R', 'tail1',
  ]);
  it.each(['humanoid-front', 'humanoid-back', 'quadruped-front', 'quadruped-back'])(
    '%s: every other child starts at its parent\'s tip',
    (id) => {
      const rig = RIG_TEMPLATES.find((t) => t.id === id)!.rig;
      const world = computeWorldTransforms(rig);
      const byId = new Map(rig.bones.map((b) => [b.id, b]));
      let checked = 0;
      for (const b of rig.bones) {
        if (b.parentId === null || ATTACHED_ELSEWHERE.has(b.name)) continue;
        const tip = boneTip(world[b.parentId], byId.get(b.parentId)!);
        const origin = boneOrigin(world[b.id]);
        expect(origin.x, `${id}:${b.name}.x`).toBeCloseTo(tip.x, 6);
        expect(origin.y, `${id}:${b.name}.y`).toBeCloseTo(tip.y, 6);
        checked++;
      }
      expect(checked).toBeGreaterThanOrEqual(id.startsWith('humanoid') ? 10 : 6);
    },
  );
});
