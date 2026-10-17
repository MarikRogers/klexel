import { describe, it, expect } from 'vitest';
import { writePicotron, picotronPaletteTest } from './picotron';
import type { ExportPlan, PlanSprite } from './plan';

function sprite(index: number, size: number, values: number[]): PlanSprite {
  const indices = new Uint8Array(size * size);
  values.forEach((v, i) => { indices[i] = v; });
  return { index, w: size, h: size, indices, mapped: new Uint32Array(size * size), original: new Uint32Array(size * size) };
}
function plan(sprites: PlanSprite[]): ExportPlan {
  return { sprites, adjusted: 0, issues: [], dropped: 0, blocked: false };
}

describe('writePicotron', () => {
  const now = new Date(2026, 9, 18, 14, 5, 9);

  it('Kopf mit Zeitstempel, 256 Einträge, Eintrag 0 ist [0]=', () => {
    const out = writePicotron(plan([sprite(1, 16, [1, 2])]), 16, now);
    expect(out.startsWith('--[[pod_format="raw",created="2026-10-18 14:05:09",modified="2026-10-18 14:05:09",revision=1]]{[0]={')).toBe(true);
    expect(out.split('bmp=userdata(').length - 1).toBe(256);
    expect(out.endsWith('}')).toBe(true);
    expect(out.endsWith(',}')).toBe(false);
  });

  it('belegtes Sprite: zwei Hexzeichen je Pixel, Zeile für Zeile', () => {
    const out = writePicotron(plan([sprite(1, 16, [1, 2])]), 16, now);
    const m = out.match(/userdata\("u8",16,16,"([0-9a-f]+)"\)/);
    expect(m).not.toBeNull();
    expect(m![1]).toHaveLength(16 * 16 * 2);
    expect(m![1].startsWith('0102' + '00'.repeat(254))).toBe(true);
  });

  it('unbelegte Einträge sind leere Sprites in Zellgröße', () => {
    const out = writePicotron(plan([sprite(1, 16, [1])]), 16, now);
    expect(out).toContain('{bmp=userdata("u8",16,16),flags=0,pan_x=0,pan_y=0,zoom=8}');
    const out8 = writePicotron(plan([sprite(1, 8, [1])]), 8, now);
    expect(out8).toContain('{bmp=userdata("u8",8,8),flags=0,pan_x=0,pan_y=0,zoom=8}');
  });

  it('Sprite steht an seinem Index', () => {
    const out = writePicotron(plan([sprite(3, 16, [5])]), 16, now);
    const entries = out.slice(out.indexOf('{[0]=') + 1).split('},{');
    expect(entries).toHaveLength(256);
    expect(entries[3]).toContain('"05');
    expect(entries[2]).not.toContain('"05');
  });
});

describe('picotronPaletteTest', () => {
  it('31 Sprites, Sprite k einfarbig in Palettenindex k', () => {
    const p = picotronPaletteTest();
    expect(p.sprites).toHaveLength(31);
    for (const s of p.sprites) {
      expect(s.w).toBe(16);
      expect(s.indices.every(v => v === s.index)).toBe(true);
    }
    expect(p.sprites[0].index).toBe(1);
  });
});
