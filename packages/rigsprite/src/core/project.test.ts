import { describe, expect, it } from 'vitest';
import {
  animationById,
  createProject,
  matchBoneByFilename,
  normalizeCameraAngle,
  parseProject,
  projectHasContent,
  serializeProject,
  toFrameInput,
} from './project';
import { makeImageAsset, makePart } from '../test/fixtures';
import { RIG_TEMPLATES } from './templates/rigs';

function sample() {
  const p = createProject('humanoid', 'Test');
  p.images['img1'] = makeImageAsset({ id: 'img1', name: 'arm.png', width: 8, height: 16 });
  p.parts.push(makePart({ id: 'p1', imageId: 'img1', boneId: 'upperArm_L', x: 1, y: 2, rotation: 3 }));
  p.animations.push({
    id: 'a1', name: 'walk', fps: 12, length: 24, loop: true,
    tracks: { hip: { rotation: [{ frame: 0, value: 1, easing: 'linear' }] } },
  });
  return p;
}

describe('project', () => {
  it('createProject deep-copies the template rig', () => {
    const p = createProject('humanoid');
    const tpl = RIG_TEMPLATES.find((t) => t.id === 'humanoid')!;
    expect(p.rig).toEqual(tpl.rig);
    expect(p.rig).not.toBe(tpl.rig);
    expect(p.rig.bones[0]).not.toBe(tpl.rig.bones[0]);
    expect(p.animations).toEqual([]);
    expect(p.settings).toEqual({ pixelArt: false, background: '#2b2b2b', spriteAxis: 'down', cameraRotation: 0, mirror: false });
  });

  it('spriteAxis defaults to down when missing and rejects invalid values', () => {
    const p = sample();
    const raw = JSON.parse(serializeProject(p));
    delete raw.settings.spriteAxis;
    const r = parseProject(JSON.stringify(raw));
    expect(r.ok && r.project.settings.spriteAxis).toBe('down');
    raw.settings.spriteAxis = 'diagonal';
    const bad = parseProject(JSON.stringify(raw));
    expect(bad.ok).toBe(false);
  });

  it('cameraRotation defaults to 0, rejects non-numbers and is normalized', () => {
    const p = sample();
    const raw = JSON.parse(serializeProject(p));
    delete raw.settings.cameraRotation;
    const r = parseProject(JSON.stringify(raw));
    expect(r.ok && r.project.settings.cameraRotation).toBe(0);
    raw.settings.cameraRotation = '90';
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
    raw.settings.cameraRotation = 270;
    const n = parseProject(JSON.stringify(raw));
    expect(n.ok && n.project.settings.cameraRotation).toBe(-90);
    raw.settings.cameraRotation = 0.1 + 0.2;
    const d = parseProject(JSON.stringify(raw));
    expect(d.ok && d.project.settings.cameraRotation).toBe(0.3);
  });

  it('mirror defaults to false, rejects non-booleans and round-trips', () => {
    const p = sample();
    const raw = JSON.parse(serializeProject(p));
    expect(raw.settings.mirror).toBe(false);
    delete raw.settings.mirror;
    const r = parseProject(JSON.stringify(raw));
    expect(r.ok && r.project.settings.mirror).toBe(false);
    for (const bad of ['ja', 1, null, {}]) {
      raw.settings.mirror = bad;
      const out = parseProject(JSON.stringify(raw));
      expect(out.ok).toBe(false);
      expect(!out.ok && out.error).toBe('Ungültige Spiegelung in den Einstellungen.');
    }
    const back = parseProject(serializeProject({ ...p, settings: { ...p.settings, mirror: true } }));
    expect(back.ok && back.project.settings.mirror).toBe(true);
  });

  it('migrates the old cameraYaw to mirror = |yaw| > 90 and drops it', () => {
    const raw = JSON.parse(serializeProject(sample()));
    delete raw.settings.mirror;
    const load = (cameraYaw: unknown) => {
      raw.settings.cameraYaw = cameraYaw;
      const r = parseProject(JSON.stringify(raw));
      if (!r.ok) throw new Error(r.error);
      return r.project.settings;
    };
    expect(load(180).mirror).toBe(true);
    expect(load(-120).mirror).toBe(true);
    expect(load(270).mirror).toBe(false);
    expect(load(30).mirror).toBe(false);
    expect(load(90).mirror).toBe(false);
    expect(load('180').mirror).toBe(false);
    expect(load(180)).not.toHaveProperty('cameraYaw');
    expect(JSON.parse(serializeProject({ ...sample(), settings: load(180) })).settings).not.toHaveProperty('cameraYaw');
    // An explicit mirror wins over a stale cameraYaw.
    raw.settings.mirror = false;
    expect(load(180).mirror).toBe(false);
  });

  it('normalizeCameraAngle wraps to (-180, 180] and rounds float drift', () => {
    expect(normalizeCameraAngle(270)).toBe(-90);
    expect(normalizeCameraAngle(-180)).toBe(180);
    expect(normalizeCameraAngle(540)).toBe(180);
    expect(normalizeCameraAngle(0.1 + 0.2)).toBe(0.3);
    expect(normalizeCameraAngle(12.3456789)).toBe(12.345679);
  });

  it('roundtrip', () => {
    const p = sample();
    const r = parseProject(serializeProject(p));
    expect(r).toEqual({ ok: true, project: p });
  });

  it('rejects invalid input with German message', () => {
    const bad = parseProject('{');
    expect(bad.ok === false && bad.error).toContain('kein gültiges JSON');
    const v = parseProject('{"version":2}');
    expect(v.ok === false && v.error).toContain('nicht unterstützte Version');
    const r = parseProject('{"version":1,"name":"x"}');
    expect(r.ok === false && r.error).toContain('Rig fehlt');
  });

  it('rejects rigs with a parent cycle', () => {
    const p = sample();
    p.rig.bones[0].parentId = 'foot_R';
    const r = parseProject(serializeProject(p));
    expect(r.ok === false && r.error).toContain('Rig ist ungültig');
  });

  it('drops parts referencing missing bones or images', () => {
    const p = sample();
    p.parts.push({ ...p.parts[0], id: 'p2', boneId: 'ghost' });
    p.parts.push({ ...p.parts[0], id: 'p3', imageId: 'nope' });
    const r = parseProject(serializeProject(p));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.parts.map((x) => x.id)).toEqual(['p1']);
  });

  it('drops animation tracks of unknown bones', () => {
    const p = sample();
    p.animations[0].tracks['ghost'] = { x: [{ frame: 0, value: 1, easing: 'linear' }] };
    const r = parseProject(serializeProject(p));
    expect(r.ok && Object.keys(r.project.animations[0].tracks)).toEqual(['hip']);
  });

  it('matchBoneByFilename', () => {
    const bones = createProject('humanoid').rig.bones;
    expect(matchBoneByFilename('Upper-Arm L.png', bones)?.id).toBe('upperArm_L');
    expect(matchBoneByFilename('foo.png', bones)).toBeNull();
  });

  it('toFrameInput', () => {
    const p = sample();
    const f = toFrameInput(p, 'a1');
    expect(f.animation).toBe(p.animations[0]);
    expect(f.images).toEqual({ img1: { width: 8, height: 16 } });
    expect(toFrameInput(p, null).animation).toBeNull();
    expect(toFrameInput(p, 'zzz').animation).toBeNull();
  });

  it('rejects malformed input', () => {
    const cases: Array<[string, (d: any) => void]> = [
      ['non-numeric bone field', (d) => { d.rig.bones[0].x = 'a'; }],
      ['non-array keyframes', (d) => { d.animations[0].tracks.hip.rotation = 5; }],
      ['image without dataUrl', (d) => { delete d.images.img1.dataUrl; }],
      ['invalid easing', (d) => { d.animations[0].tracks.hip.rotation[0].easing = 'bounce'; }],
      ['missing parent', (d) => { d.rig.bones[1].parentId = 'nobody'; }],
      ['duplicate bone ids', (d) => { d.rig.bones[1].id = d.rig.bones[0].id; }],
      ['two roots', (d) => { d.rig.bones[1].parentId = null; }],
      ['width 0', (d) => { d.images.img1.width = 0; }],
      ['fps 0', (d) => { d.animations[0].fps = 0; }],
      ['bone length 0', (d) => { d.rig.bones[0].length = 0; }],
      ['image key differs from id', (d) => { d.images.img1.id = 'other'; }],
      ['remote image url', (d) => { d.images.img1.dataUrl = 'https://example.com/x.png'; }],
      ['non-image data url', (d) => { d.images.img1.dataUrl = 'data:text/html,<b>x</b>'; }],
    ];
    for (const [label, mutate] of cases) {
      const d = JSON.parse(serializeProject(sample()));
      mutate(d);
      const r = parseProject(JSON.stringify(d));
      expect(r.ok, label).toBe(false);
    }
  });

  it('sorts keyframes and drops duplicate frames (last wins)', () => {
    const p = sample();
    p.animations[0].tracks.hip.rotation = [
      { frame: 5, value: 5, easing: 'linear' },
      { frame: 0, value: 1, easing: 'linear' },
      { frame: 5, value: 9, easing: 'step' },
    ];
    const r = parseProject(serializeProject(p));
    expect(r.ok && r.project.animations[0].tracks.hip.rotation).toEqual([
      { frame: 0, value: 1, easing: 'linear' },
      { frame: 5, value: 9, easing: 'step' },
    ]);
  });

  it('rejects image data that is not an embedded data:image/ URL with a German message', () => {
    const d = JSON.parse(serializeProject(sample()));
    d.images.img1.dataUrl = 'https://example.com/x.png';
    const r = parseProject(JSON.stringify(d));
    expect(r).toEqual({ ok: false, error: 'Bilder sind ungültig: nur eingebettete Bilddaten (data:image/…) erlaubt.' });
  });

  it('projectHasContent counts images, parts and animations', () => {
    const empty = createProject('humanoid');
    expect(projectHasContent(empty)).toBe(false);
    const withImage = createProject('humanoid');
    withImage.images['i'] = makeImageAsset({ id: 'i', name: 'x.png', width: 1, height: 1 });
    expect(projectHasContent(withImage)).toBe(true);
    expect(projectHasContent(sample())).toBe(true);
    const withAnim = createProject('humanoid');
    withAnim.animations.push({ id: 'a', name: 'a', fps: 12, length: 1, loop: true, tracks: {} });
    expect(projectHasContent(withAnim)).toBe(true);
  });
});

describe('animationById', () => {
  it('finds an animation, and returns undefined for unknown or missing ids', () => {
    const p = sample();
    expect(animationById(p, 'a1')).toBe(p.animations[0]);
    expect(animationById(p, 'nope')).toBeUndefined();
    expect(animationById(p, null)).toBeUndefined();
  });
});
