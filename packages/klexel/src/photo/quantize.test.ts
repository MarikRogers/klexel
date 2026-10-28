import { describe, it, expect } from 'vitest';
import { quantize } from './quantize';
import { PICO8 } from '../palette/palettes';

const BW = [0x000000ff, 0xffffffff];
const fill = (n: number, v: number) => new Uint32Array(n).fill(v >>> 0);
const whites = (a: Uint32Array) => [...a].filter(v => v === 0xffffffff).length;

describe('quantize: none', () => {
  it('nächste Palettenfarbe', () => {
    expect([...quantize(Uint32Array.of(0x202020ff, 0xe0e0e0ff), 2, 1, BW, 'none', false)]).toEqual([0x000000ff, 0xffffffff]);
  });
  it('skipFirst: Schwarz wird nie Palettenfarbe 0', () => {
    const out = quantize(Uint32Array.of(0x000000ff), 1, 1, PICO8, 'none', true);
    expect(out[0]).toBe(PICO8[1]); // nächste andere Farbe #1d2b53
  });
  it('ohne skipFirst bleibt Schwarz möglich', () => {
    expect(quantize(Uint32Array.of(0x000000ff), 1, 1, PICO8, 'none', false)[0]).toBe(PICO8[0]);
  });
  it('einfarbige Palette: alle deckenden Pixel in dieser Farbe', () => {
    const out = quantize(Uint32Array.of(0xff0000ff, 0x00ff00ff, 0), 3, 1, [0x336699ff], 'none', false);
    expect([...out]).toEqual([0x336699ff, 0x336699ff, 0]);
  });
  it('zu kleine Palette wirft RangeError', () => {
    expect(() => quantize(Uint32Array.of(0xff0000ff), 1, 1, [], 'none', false)).toThrow(RangeError);
    expect(() => quantize(Uint32Array.of(0xff0000ff), 1, 1, [0x336699ff], 'none', true)).toThrow(RangeError);
  });
});

describe('quantize: Transparenz', () => {
  for (const d of ['none', 'bayer', 'floyd'] as const) {
    it(`Alpha < 128 bleibt 0, Alpha 128 wird deckend (${d})`, () => {
      const out = quantize(Uint32Array.of(0xff000040, 0xff000080), 2, 1, PICO8, d, true);
      expect(out[0]).toBe(0);
      expect(out[1] & 255).toBe(255);
    });
  }
});

describe('quantize: bayer', () => {
  it('Mittelgrau ergibt etwa die Hälfte Weiß, wiederholbar', () => {
    const px = fill(16, 0x808080ff);
    const a = quantize(px, 4, 4, BW, 'bayer', false);
    expect(whites(a)).toBeGreaterThanOrEqual(6);
    expect(whites(a)).toBeLessThanOrEqual(10);
    expect([...quantize(px, 4, 4, BW, 'bayer', false)]).toEqual([...a]);
  });
  it('reines Schwarz bleibt Schwarz, reines Weiß bleibt Weiß', () => {
    expect(whites(quantize(fill(16, 0x000000ff), 4, 4, BW, 'bayer', false))).toBe(0);
    expect(whites(quantize(fill(16, 0xffffffff), 4, 4, BW, 'bayer', false))).toBe(16);
  });
});

describe('quantize: floyd', () => {
  it('Mittelgrau ergibt etwa die Hälfte Weiß, wiederholbar', () => {
    const px = fill(64, 0x808080ff);
    const a = quantize(px, 8, 8, BW, 'floyd', false);
    expect(whites(a)).toBeGreaterThanOrEqual(24);
    expect(whites(a)).toBeLessThanOrEqual(40);
    expect([...quantize(px, 8, 8, BW, 'floyd', false)]).toEqual([...a]);
  });
  it('transparente Pixel verbreiten keinen Fehler', () => {
    // Zeile: grau, transparent, grau. Das dritte Pixel hängt nur vom zweiten (transparent) ab, nicht vom ersten.
    const withGap = quantize(Uint32Array.of(0x808080ff, 0, 0x808080ff), 3, 1, BW, 'floyd', false);
    const alone = quantize(Uint32Array.of(0x808080ff), 1, 1, BW, 'floyd', false);
    expect(withGap[2]).toBe(alone[0]);
  });
});
