import { describe, it, expect } from 'vitest';
import { enabledAreas, loadDescriptors, descriptorFor, AREAS } from './areas';
import { appNameFor, buildAreas, cacheNameFor } from './areaNames';

describe('enabledAreas', () => {
  it('ohne Angabe: beide Bereiche', () => {
    expect(enabledAreas(undefined)).toEqual(['klexel', 'rigsprite']);
  });
  it('einzelner Bereich', () => {
    expect(enabledAreas('klexel')).toEqual(['klexel']);
    expect(enabledAreas('rigsprite')).toEqual(['rigsprite']);
  });
  it('Leerzeichen und Groß-/Kleinschreibung egal', () => {
    expect(enabledAreas(' Klexel , rigsprite ')).toEqual(['klexel', 'rigsprite']);
  });
  it('Doppelte entfallen', () => {
    expect(enabledAreas('klexel,KLEXEL, klexel')).toEqual(['klexel']);
  });
  it('unbekannter Name → klarer Fehler', () => {
    expect(() => enabledAreas('foo')).toThrow(/Unbekannter Bereich „foo"/);
    expect(() => enabledAreas('klexel,foo')).toThrow(/foo/);
  });
  it('leer → klarer Fehler', () => {
    expect(() => enabledAreas('')).toThrow(/VITE_AREAS ist leer/);
    expect(() => enabledAreas(' , ')).toThrow(/VITE_AREAS ist leer/);
  });
});

describe('buildAreas', () => {
  it('jede Auswahl ist baubar, auch nur Rigsprite', () => {
    expect(buildAreas(undefined)).toEqual(['klexel', 'rigsprite']);
    expect(buildAreas('klexel')).toEqual(['klexel']);
    expect(buildAreas('rigsprite')).toEqual(['rigsprite']);
  });
  it('unbekannte Namen bleiben ein klarer Fehler', () => {
    expect(() => buildAreas('klexel,foo')).toThrow(/Unbekannter Bereich „foo"/);
  });
});

describe('Aussehen je Build', () => {
  it('Name: nur Rigsprite → RigSprite, sonst Klexel', () => {
    expect(appNameFor(['klexel', 'rigsprite'])).toBe('Klexel');
    expect(appNameFor(['klexel'])).toBe('Klexel');
    expect(appNameFor(['rigsprite'])).toBe('RigSprite');
  });
  it('Cache-Name: Standard unverändert, jede andere Auswahl eigen', () => {
    expect(cacheNameFor(['klexel', 'rigsprite'])).toBe('pixelart-v7');
    expect(cacheNameFor(['rigsprite', 'klexel'])).toBe('pixelart-v7');
    const k = cacheNameFor(['klexel']), r = cacheNameFor(['rigsprite']);
    expect(new Set(['pixelart-v7', k, r]).size).toBe(3);
  });
});

describe('Bereichs-Beschreibungen (Test-Build: alle Bereiche)', () => {
  it('Standard-Auswahl im Test', () => {
    expect(AREAS).toEqual(['klexel', 'rigsprite']);
  });

  it('Klexel und Rigsprite sind beschrieben (Klexel zuerst)', async () => {
    const ds = await loadDescriptors();
    expect(ds.map(d => d.kind)).toEqual(['klexel', 'rigsprite']);
    expect((await descriptorFor('rigsprite'))?.title).toBe('Rigsprite');
    expect(await descriptorFor('foo')).toBeUndefined();
  });

  it('Rigsprite: blank lesbar, decode(Unlesbares) = null, changeKey', async () => {
    const d = (await descriptorFor('rigsprite'))!;
    const p = d.blank({ width: 3, height: 2 });
    expect(d.decode(p)).toEqual(p);
    expect(d.decode(JSON.parse(JSON.stringify(p)))).toEqual(p);
    for (const raw of [null, 7, 'x', {}, { version: 1 }]) expect(d.decode(raw)).toBeNull();
    expect(d.changeKey(p)).toBe(d.changeKey(d.blank()));
    expect(d.changeKey(p)).not.toBe(d.changeKey({ ...(p as object), name: 'anders' }));
  });

  it('Klexel: blank ist lesbar und hat die gewünschte Größe samt Bildpixeln', async () => {
    const d = (await descriptorFor('klexel'))!;
    const pixels = new Uint32Array(6).fill(0x336699ff);
    const p = d.blank({ width: 3, height: 2, image: { width: 3, height: 2, pixels } });
    expect(d.decode(p)).toBe(p);
    expect(p).toMatchObject({ width: 3, height: 2 });
    // Bild übernommen: anderer Schlüssel als ein leeres Projekt gleicher Größe
    expect(d.changeKey(p)).not.toBe(d.changeKey(d.blank({ width: 3, height: 2 })));
  });

  it('Klexel: decode(Unlesbares) = null', async () => {
    const d = (await descriptorFor('klexel'))!;
    for (const raw of [null, 7, 'x', {}, { version: 3, width: 'a' }]) expect(d.decode(raw)).toBeNull();
  });

  it('Klexel: changeKey gleich bei gleichem Inhalt, verschieden nach Pixeländerung', async () => {
    const d = (await descriptorFor('klexel'))!;
    const img = (v: number) => ({ width: 2, height: 2, pixels: new Uint32Array(4).fill(v) });
    const a = d.blank({ width: 2, height: 2, image: img(0x000000ff) });
    expect(d.changeKey(a)).toBe(d.changeKey(d.blank({ width: 2, height: 2, image: img(0x000000ff) })));
    expect(d.changeKey(a)).not.toBe(d.changeKey(d.blank({ width: 2, height: 2, image: img(0x000100ff) })));
  });
});

// Die Hülle kennt Bereiche nur über areas.ts: keine andere Datei unter apps/suite/src importiert ein Bereichs-Paket
describe('Isolation der Hülle', () => {
  const files = import.meta.glob(['./**/*.ts', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const specs = (src: string) => [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  const areaPkg = /^@suite\/(klexel|rigsprite)(\/|$)/;

  it('findet Dateien und erkennt Bereichs-Importe', () => {
    expect(Object.keys(files)).toContain('./areas.ts');
    expect(Object.keys(files)).toContain('./main.ts');
    expect(Object.keys(files)).toContain('./shell/shell.ts');
    expect(specs(files['./areas.ts']).some(s => areaPkg.test(s))).toBe(true);
    expect(areaPkg.test('@suite/klexel/style.css')).toBe(true);
  });

  it('nur areas.ts importiert @suite/klexel bzw. @suite/rigsprite', () => {
    const bad = Object.entries(files)
      .filter(([f]) => f !== './areas.ts')
      .flatMap(([f, src]) => specs(src).filter(s => areaPkg.test(s)).map(s => `${f}: ${s}`));
    expect(bad).toEqual([]);
  });
});
