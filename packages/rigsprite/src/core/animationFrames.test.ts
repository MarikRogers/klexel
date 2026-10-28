import { describe, expect, it } from 'vitest';
import { makeImageAsset, makePart } from '../test/fixtures';
import { animationFrames, animationFrameSize, rgbaToPacked } from './animationFrames';
import { computeExportBounds, planSheet } from './export';
import { buildFrame } from './frame';
import { createProject, toFrameInput, type Project } from './project';
import { ANIMATION_TEMPLATES, applyAnimationTemplate } from './templates/animations';

/** Humanoid mit einem Bild am Kopf und der Walk-Vorlage. */
function walkProject(over: Partial<Project['settings']> = {}): { project: Project; animationId: string } {
  const p = createProject('humanoid');
  const head = p.rig.bones.find((b) => b.name === 'head') ?? p.rig.bones[0];
  const body = p.rig.bones[0];
  const walkT = ANIMATION_TEMPLATES.find((t) => t.rigTemplateId === 'humanoid' && /walk/i.test(t.name))!;
  const walk = applyAnimationTemplate(walkT, p.rig);
  const project: Project = {
    ...p,
    images: { img: makeImageAsset({ width: 20, height: 40 }) },
    parts: [makePart({ id: 'a', boneId: head.id }), makePart({ id: 'b', boneId: body.id, z: 1 })],
    animations: [walk],
    settings: { ...p.settings, ...over },
  };
  return { project, animationId: walk.id };
}

describe('animationFrameSize', () => {
  it('entspricht den Grenzen des Spritesheet-Exports (Maßstab 1, ohne Padding) über alle Frames der Animation', () => {
    for (const settings of [{}, { cameraRotation: 30 }, { mirror: true }]) {
      const { project, animationId } = walkProject(settings);
      const anim = project.animations[0];
      const input = toFrameInput(project, animationId);
      const frames = Array.from({ length: anim.length }, (_, i) => buildFrame(input, i));
      const { cameraRotation, mirror } = project.settings;
      const plan = planSheet([anim.length], computeExportBounds(frames, 0, cameraRotation, mirror ? -1 : 1), 1, 8);
      expect(animationFrameSize(project, animationId)).toEqual({
        width: plan.frameW, height: plan.frameH, frameCount: anim.length, fps: anim.fps,
      });
      expect(animationFrames(project, animationId)!.pivot).toEqual(plan.pivot);
    }
  });

  it('Größe ist für alle Frames gleich und mindestens 1×1; unbekannte Animation → null', () => {
    const { project, animationId } = walkProject();
    const size = animationFrameSize(project, animationId)!;
    expect(size.width).toBeGreaterThanOrEqual(20);
    expect(size.height).toBeGreaterThanOrEqual(40);
    expect(animationFrameSize({ ...project, parts: [] }, animationId)).toMatchObject({ width: 1, height: 1 });
    expect(animationFrameSize(project, 'gibt-es-nicht')).toBeNull();
  });
});

describe('rgbaToPacked', () => {
  // 2×2: oben Rot, Grün; unten Blau, halbtransparentes Weiß
  const bytes = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128]);

  it('Zeilen von oben (getImageData) → 0xRRGGBBAA in derselben Reihenfolge', () => {
    expect([...rgbaToPacked(bytes, 2, 2)]).toEqual([0xff0000ff, 0x00ff00ff, 0x0000ffff, 0xffffff80]);
  });

  it('flipY: Zeilen von unten (readPixels) werden umgedreht', () => {
    expect([...rgbaToPacked(bytes, 2, 2, true)]).toEqual([0x0000ffff, 0xffffff80, 0xff0000ff, 0x00ff00ff]);
  });

  it('falsche Länge → RangeError', () => {
    expect(() => rgbaToPacked(bytes, 3, 2)).toThrow(RangeError);
  });
});
