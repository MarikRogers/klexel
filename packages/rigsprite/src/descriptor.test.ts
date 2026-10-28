import { describe, expect, it } from 'vitest';
import { AREA_MARKER, AREA_MARKER_RIGSPRITE, rigspriteDescriptor as d } from './index';
import { createProject, serializeProject } from './core/project';
import { makeImageAsset } from './test/fixtures';

describe('rigspriteDescriptor', () => {
  it('Art, Titel und Marker', () => {
    expect(d.kind).toBe('rigsprite');
    expect(d.title).toBe('Rigsprite');
    expect(AREA_MARKER).toBe('AREA_MARKER_RIGSPRITE');
    expect(AREA_MARKER_RIGSPRITE).toBe(AREA_MARKER);
    expect(d.marker).toBe(AREA_MARKER);
    expect(d.readLegacy).toBeUndefined();
    expect(d.newProjectSize).toBeFalsy();
  });

  it('blank: lesbares Humanoid-Projekt, Größe wird ignoriert', () => {
    const p = d.blank({ width: 4, height: 3 });
    expect(p.rigTemplateId).toBe('humanoid');
    expect(d.decode(p)).toEqual(p);
    expect(d.blank()).toEqual(createProject('humanoid'));
  });

  it('decode: gespeichertes Objekt und JSON-Wert lesbar, Unsinn null', () => {
    const p = createProject('quadruped', 'Hund');
    expect(d.decode(JSON.parse(serializeProject(p)))).toEqual(p);
    for (const raw of [null, undefined, 1, 'x', [], {}, { version: 1 }, { version: 2, rig: { bones: [] } }]) {
      expect(d.decode(raw)).toBeNull();
    }
  });

  it('changeKey: gleich bei gleichem Inhalt, verschieden bei Änderungen', () => {
    const a = createProject('humanoid');
    const b = createProject('humanoid');
    expect(d.changeKey(a)).toBe(d.changeKey(b));
    expect(d.changeKey(a)).toBe(d.changeKey(JSON.parse(serializeProject(a))));

    const moved = { ...a, rig: { bones: a.rig.bones.map((x, i) => (i === 1 ? { ...x, rotation: x.rotation + 1 } : x)) } };
    const img = makeImageAsset({ id: 'i1', width: 2, height: 2 });
    const withImage = { ...a, images: { i1: img } };
    const otherImage = { ...a, images: { i1: { ...img, dataUrl: img.dataUrl + 'A' } } };
    const renamed = { ...a, name: a.name + '!' };
    const keys = [a, moved, withImage, otherImage, renamed].map(d.changeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(d.changeKey(withImage)).toBe(d.changeKey(structuredClone(withImage)));
  });
});
