import { describe, expect, it } from 'vitest';
import { ANIMATION_TEMPLATES, applyAnimationTemplate } from './animations';
import { RIG_TEMPLATES } from './rigs';
import { sampleAnimation, sampleChannel } from '../animation';
import { boneOrigin, boneTip, computeWorldTransforms, rigHeight, type Rig, type RigTemplateId } from '../rig';
import { createProject, parseProject, serializeProject } from '../project';

const rigOf = (id: string) => RIG_TEMPLATES.find((r) => r.id === id)!.rig;
const tpl = (id: string) => ANIMATION_TEMPLATES.find((t) => t.id === id)!;

describe('animation templates', () => {
  it('provides the expected templates', () => {
    expect(ANIMATION_TEMPLATES.map((t) => t.id)).toEqual([
      'humanoid-idle', 'humanoid-walk', 'humanoid-run', 'humanoid-jump', 'humanoid-punch',
      'quadruped-idle', 'quadruped-walk',
      'humanoid-front-idle', 'humanoid-front-walk', 'humanoid-front-run', 'humanoid-front-jump',
      'humanoid-front-punch',
      'humanoid-back-idle', 'humanoid-back-walk', 'humanoid-back-run', 'humanoid-back-jump', 'humanoid-back-punch',
      'quadruped-front-idle', 'quadruped-front-walk',
      'quadruped-back-idle', 'quadruped-back-walk',
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

describe('front and back view animation templates', () => {
  const VIEWS: [RigTemplateId, RigTemplateId][] = [
    ['humanoid-front', 'humanoid'],
    ['humanoid-back', 'humanoid'],
    ['quadruped-front', 'quadruped'],
    ['quadruped-back', 'quadruped'],
  ];
  const ofRig = (id: RigTemplateId) => ANIMATION_TEMPLATES.filter((t) => t.rigTemplateId === id);

  it.each(VIEWS)('%s has the same set (names, fps, length, loop) as %s', (view, side) => {
    const strip = (id: RigTemplateId) => ofRig(id).map((t) => [t.name, t.fps, t.length, t.loop]);
    expect(strip(view)).toEqual(strip(side));
    for (const t of ofRig(view)) expect(t.id).toBe(`${view}-${t.name}`);
  });

  it('every rig template id of an animation exists', () => {
    for (const t of ANIMATION_TEMPLATES) expect(RIG_TEMPLATES.some((r) => r.id === t.rigTemplateId)).toBe(true);
  });

  it.each(VIEWS.map(([v]) => v))('%s: every frame keeps the rig finite, on screen and joints together', (view) => {
    const rig = rigOf(view);
    const h = rigHeight(rig);
    for (const t of ofRig(view)) {
      const anim = applyAnimationTemplate(t, rig);
      for (let f = 0; f <= t.length; f += 0.5) {
        const world = computeWorldTransforms(rig, sampleAnimation(anim, f));
        for (const b of rig.bones) {
          for (const p of [boneOrigin(world[b.id]), boneTip(world[b.id], b)]) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${t.id}@${f}:${b.name}`).toBe(true);
            expect(Math.abs(p.x), `${t.id}@${f}:${b.name}.x`).toBeLessThan(h);
            expect(Math.abs(p.y), `${t.id}@${f}:${b.name}.y`).toBeLessThan(h);
          }
        }
      }
    }
  });

  it.each(VIEWS.map(([v]) => v))('%s: applied animations survive the project round trip', (view) => {
    const p = createProject(view);
    p.animations = ofRig(view).map((t) => applyAnimationTemplate(t, p.rig));
    const r = parseProject(serializeProject(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.rigTemplateId).toBe(view);
    // via JSON: -0 in sampled keys is written as 0
    expect(r.project.animations).toEqual(JSON.parse(JSON.stringify(p.animations)));
  });

  const hipShiftAtLift = (id: string, rootName: string, stanceBone: string, lifted: string) => {
    const rig = rigOf(id.split('-').slice(0, 2).join('-'));
    const t = tpl(id);
    // find the frame where the lifted leg is tilted furthest (shortest on screen)
    const track = t.tracks[lifted].tilt!;
    const k = track.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a));
    const shift = sampleChannel(t.tracks[rootName].x!, k.frame, 0);
    const stanceX = boneOrigin(computeWorldTransforms(rig)[stanceBone]).x;
    return { shift, stanceX };
  };

  it.each(['humanoid-front-walk', 'humanoid-back-walk', 'humanoid-front-run', 'humanoid-back-run'])(
    '%s shifts the hip over the stance leg (screen side flips between views)',
    (id) => {
      const { shift, stanceX } = hipShiftAtLift(id, 'hip', 'thigh_R', 'thigh_L');
      expect(Math.abs(shift)).toBeGreaterThan(0.5);
      expect(Math.sign(shift)).toBe(Math.sign(stanceX));
    },
  );

  it('front and back walk shift the hip to opposite screen sides', () => {
    const front = tpl('humanoid-front-walk').tracks.hip.x!;
    const back = tpl('humanoid-back-walk').tracks.hip.x!;
    front.forEach((k, i) => expect(back[i].value).toBeCloseTo(-k.value, 6));
  });

  it.each(['quadruped-front-walk', 'quadruped-back-walk'])('%s lifts diagonal pairs and shifts to the stance side', (id) => {
    const t = tpl(id);
    for (const f of [0, 2, 4, 6, 10]) {
      expect(sampleChannel(t.tracks.frontUpper_L.tilt!, f, 0)).toBeCloseTo(sampleChannel(t.tracks.backUpper_R.tilt!, f, 0), 6);
      expect(sampleChannel(t.tracks.frontUpper_R.tilt!, f, 0)).toBeCloseTo(sampleChannel(t.tracks.backUpper_L.tilt!, f, 0), 6);
    }
    const { shift, stanceX } = hipShiftAtLift(id, 'body', 'frontUpper_R', 'frontUpper_L');
    expect(Math.sign(shift)).toBe(Math.sign(stanceX));
  });

  it.each(['humanoid-front-walk', 'humanoid-back-walk'])('%s lifts legs alternately by tilting them in depth', (id) => {
    const t = tpl(id);
    const side = id.includes('front') ? 1 : -1;
    const l = (f: number) => side * sampleChannel(t.tracks.thigh_L.tilt!, f, 0);
    const r = (f: number) => side * sampleChannel(t.tracks.thigh_R.tilt!, f, 0);
    // foreshortened by more than 5 % on screen, towards the viewer in the front view, away in the back view
    expect(Math.cos((l(4) * Math.PI) / 180)).toBeLessThan(0.95);
    expect(l(4)).toBeGreaterThan(0);
    expect(r(4)).toBeCloseTo(0, 6);
    expect(r(12)).toBeGreaterThan(0);
    expect(l(12)).toBeCloseTo(0, 6);
  });

  it.each(['humanoid-walk', 'humanoid-run', 'humanoid-jump', 'quadruped-walk', 'humanoid-front-idle', 'humanoid-front-punch'])(
    'flat templates (%s) carry no depth channels',
    (id) => {
      for (const track of Object.values(tpl(id).tracks)) {
        for (const c of ['tilt', 'turn', 'depth'] as const) expect(track[c], `${id}.${c}`).toBeUndefined();
      }
    },
  );

  it.each(['walk', 'run', 'jump'])('humanoid back-%s tilts mirror the front view (sign flipped)', (name) => {
    const front = tpl(`humanoid-front-${name}`);
    const back = tpl(`humanoid-back-${name}`);
    for (const bone of ['thigh_L', 'thigh_R']) {
      const f = front.tracks[bone].tilt!;
      const b = back.tracks[bone].tilt!;
      expect(f.length).toBeGreaterThan(0);
      f.forEach((k, i) => expect(b[i].value).toBeCloseTo(-k.value, 6));
    }
  });

  it.each(['humanoid-front-walk', 'humanoid-front-run', 'quadruped-front-walk', 'humanoid-front-jump'])(
    '%s no longer fakes the depth with a scale on the legs',
    (id) => {
      const t = tpl(id);
      const legs = Object.keys(t.tracks).filter((n) => /^(thigh|frontUpper|backUpper)_/.test(n));
      expect(legs.length).toBeGreaterThan(0);
      for (const n of legs) {
        expect(t.tracks[n].tilt, `${id}:${n}`).toBeDefined();
        expect(t.tracks[n].scaleX, `${id}:${n}`).toBeUndefined();
      }
    },
  );

  it('front punch: the right arm comes toward the viewer (scaled up uniformly at the strike)', () => {
    const t = tpl('humanoid-front-punch');
    const strike = sampleChannel(t.tracks.upperArm_R.scaleX!, 4, 1);
    expect(strike).toBeGreaterThanOrEqual(1.15);
    expect(strike).toBeLessThanOrEqual(1.25);
    expect(t.tracks.upperArm_R.scaleY).toEqual(t.tracks.upperArm_R.scaleX);
  });

  it('back punch: the right arm goes away from the viewer (scaled down uniformly at the strike)', () => {
    const t = tpl('humanoid-back-punch');
    const strike = sampleChannel(t.tracks.upperArm_R.scaleX!, 4, 1);
    expect(strike).toBeGreaterThanOrEqual(0.8);
    expect(strike).toBeLessThanOrEqual(0.9);
    expect(sampleChannel(t.tracks.upperArm_R.scaleX!, 2, 1)).toBeGreaterThan(1);
    expect(t.tracks.upperArm_R.scaleY).toEqual(t.tracks.upperArm_R.scaleX);
  });

  it.each(['humanoid-front', 'humanoid-back'])('%s-jump raises the arms outward on screen', (view) => {
    const rig = rigOf(view);
    const anim = applyAnimationTemplate(tpl(`${view}-jump`), rig);
    const rest = computeWorldTransforms(rig);
    const up = computeWorldTransforms(rig, sampleAnimation(anim, 6));
    for (const s of ['L', 'R']) {
      const b = rig.bones.find((x) => x.name === `hand_${s}`)!;
      const r0 = boneTip(rest[b.id], b);
      const r1 = boneTip(up[b.id], b);
      expect(Math.sign(r1.x)).toBe(Math.sign(r0.x));
      expect(Math.abs(r1.x)).toBeGreaterThan(Math.abs(r0.x));
      expect(r1.y).toBeLessThan(r0.y);
    }
  });
});
