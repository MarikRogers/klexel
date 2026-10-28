import { describe, it, expect } from 'vitest';
import { buildExportPlan, defaultCell, type ExportFrame, type ExportOptions } from './plan';
import { PICO8 } from '../../palette/palettes';

const RED = PICO8[8];

function solid(w: number, h: number, color = RED): ExportFrame {
  return { width: w, height: h, pixels: new Uint32Array(w * h).fill(color) };
}
function opts(o: Partial<ExportOptions>): ExportOptions {
  return { target: 'picotron', mode: 'slice', cell: 16, start: 1, truncate: false, ...o };
}

describe('buildExportPlan: slice', () => {
  it('Picotron 20×20, Zelle 16: vier Zellen zeilenweise, Rand aufgefüllt, nichts abgeschnitten', () => {
    const p = buildExportPlan([solid(20, 20)], opts({}));
    expect(p.sprites.map(s => s.index)).toEqual([1, 2, 3, 4]);
    expect(p.sprites.every(s => s.w === 16 && s.h === 16)).toBe(true);
    expect(p.issues).toEqual([]);
    expect(p.blocked).toBe(false);
    const right = p.sprites[1]; // Zelle (1,0): Bild-x 16..19 gefüllt, danach leer
    expect(right.indices[3]).toBeGreaterThan(0);
    expect(right.indices[4]).toBe(0);
    expect(right.indices[16 * 4]).toBeGreaterThan(0); // Zeile 4 noch im Bild
    expect(right.indices[16 * 4 + 4]).toBe(0);
  });

  it('PICO-8 16×16, Start 1: vier 8×8-Sprites 1..4', () => {
    const p = buildExportPlan([solid(16, 16)], opts({ target: 'pico8', cell: 99 }));
    expect(p.sprites.map(s => s.index)).toEqual([1, 2, 3, 4]);
    expect(p.sprites.every(s => s.w === 8 && s.h === 8)).toBe(true);
  });

  it('1×1-Bild ergibt ein aufgefülltes Sprite', () => {
    const p = buildExportPlan([solid(1, 1)], opts({}));
    expect(p.sprites).toHaveLength(1);
    expect(p.sprites[0].indices[0]).toBeGreaterThan(0);
    expect(p.sprites[0].indices[1]).toBe(0);
  });

  it('Start 255 mit 4 Zellen: count-Problem, gesperrt; mit truncate 1 Sprite, 3 verworfen', () => {
    const blocked = buildExportPlan([solid(20, 20)], opts({ start: 255 }));
    expect(blocked.issues.map(i => i.kind)).toContain('count');
    expect(blocked.blocked).toBe(true);
    expect(blocked.sprites).toHaveLength(4);
    const cut = buildExportPlan([solid(20, 20)], opts({ start: 255, truncate: true }));
    expect(cut.sprites.map(s => s.index)).toEqual([255]);
    expect(cut.dropped).toBe(3);
    expect(cut.blocked).toBe(false);
  });

  it('Start 256: empty-Problem, immer gesperrt', () => {
    for (const truncate of [false, true]) {
      const p = buildExportPlan([solid(16, 16)], opts({ start: 256, truncate }));
      expect(p.issues.map(i => i.kind)).toContain('empty');
      expect(p.blocked).toBe(true);
    }
    expect(buildExportPlan([solid(16, 16)], opts({ start: 256, truncate: true })).sprites).toHaveLength(0);
  });

  it('riesige Startnummer verhält sich wie 256: empty-Problem, Indizes bleiben klein', () => {
    const p = buildExportPlan([solid(32, 32)], opts({ start: 1e9 }));
    expect(p.issues.map(i => i.kind)).toContain('empty');
    expect(p.blocked).toBe(true);
    expect(Math.max(...p.sprites.map(s => s.index))).toBeLessThan(300);
  });

  it('komplett transparentes Bild: alle Indizes 0, nichts angepasst', () => {
    const p = buildExportPlan([solid(16, 16, 0)], opts({}));
    expect(p.adjusted).toBe(0);
    expect(p.sprites[0].indices.every(v => v === 0)).toBe(true);
  });

  it('adjusted zählt verschiedene angepasste Farben über alle Sprites', () => {
    const f = solid(16, 16, 0xff0000ff);
    f.pixels[0] = 0x00ff00ff;
    const p = buildExportPlan([f], opts({}));
    expect(p.adjusted).toBe(2);
  });

  it('original enthält die unreduzierten Pixel desselben Zuschnitts', () => {
    const p = buildExportPlan([solid(16, 16, 0xff0000ff)], opts({ target: 'pico8' }));
    expect(p.sprites[0].original[0]).toBe(0xff0000ff);
    expect(p.sprites[0].mapped[0]).toBe(RED);
  });
});

describe('buildExportPlan: frames', () => {
  it('PICO-8, drei 8×8-Frames, Start 1 → 1,2,3', () => {
    const p = buildExportPlan([solid(8, 8), solid(8, 8), solid(8, 8)], opts({ target: 'pico8', mode: 'frames' }));
    expect(p.sprites.map(s => s.index)).toEqual([1, 2, 3]);
  });

  it('PICO-8, 17 Frames à 16×16, Start 1: 2×2-Blöcke hintereinander ab Zelle 1, Umbruch ohne Überlauf', () => {
    const frames = Array.from({ length: 17 }, () => solid(16, 16));
    const p = buildExportPlan(frames, opts({ target: 'pico8', mode: 'frames' }));
    expect(p.issues).toEqual([]);
    expect(p.sprites).toHaveLength(17 * 4);
    const idx = p.sprites.map(s => s.index);
    expect(idx.slice(0, 4)).toEqual([1, 2, 17, 18]); // erster Block beginnt bei der Startnummer
    expect(idx.slice(6 * 4, 6 * 4 + 4)).toEqual([13, 14, 29, 30]); // siebter Block: letzter, der noch passt
    expect(idx.slice(7 * 4, 7 * 4 + 4)).toEqual([32, 33, 48, 49]); // Umbruch: nächste Blockzeile ab Spalte 0
    expect(new Set(idx).size).toBe(idx.length);
    expect(idx.every(i => i <= 255)).toBe(true);
  });

  it('PICO-8, 16×16-Frames, Start 0: erster Block bei Zelle 0', () => {
    const p = buildExportPlan([solid(16, 16), solid(16, 16)], opts({ target: 'pico8', mode: 'frames', start: 0 }));
    expect(p.sprites.map(s => s.index).slice(0, 8)).toEqual([0, 1, 16, 17, 2, 3, 18, 19]);
  });

  it('Picotron, 24×24-Frame bei Zelle 16: crop-Problem, bei truncate auf 16×16 beschnitten', () => {
    const p = buildExportPlan([solid(24, 24)], opts({ mode: 'frames' }));
    expect(p.issues.map(i => i.kind)).toContain('crop');
    expect(p.blocked).toBe(true);
    const cut = buildExportPlan([solid(24, 24)], opts({ mode: 'frames', truncate: true }));
    expect(cut.blocked).toBe(false);
    expect(cut.sprites[0].w).toBe(16);
    expect(cut.sprites[0].indices).toHaveLength(256);
  });

  it('64 Frames à 32×32 bei Picotron Zelle 32 passen', () => {
    const frames = Array.from({ length: 64 }, () => solid(32, 32));
    const p = buildExportPlan(frames, opts({ mode: 'frames', cell: 32 }));
    expect(p.issues).toEqual([]);
    expect(p.sprites).toHaveLength(64);
  });
});

describe('defaultCell', () => {
  it('Picotron richtet sich nach der Frame-Größe', () => {
    expect(defaultCell('picotron', [solid(8, 8)])).toBe(8);
    expect(defaultCell('picotron', [solid(16, 16)])).toBe(16);
    expect(defaultCell('picotron', [solid(20, 20)])).toBe(32);
    expect(defaultCell('picotron', [solid(100, 100)])).toBe(32);
  });
  it('PICO-8 ist fest 8', () => {
    expect(defaultCell('pico8', [solid(16, 16)])).toBe(8);
  });
});
