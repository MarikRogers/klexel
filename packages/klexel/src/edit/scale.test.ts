import { describe, it, expect } from 'vitest';
import { scaleFloating, MAX_SCALE_COLORS } from './scale';
import type { Floating } from './SelectionSession';

const C: Record<string, number> = { R: 0xff0000ff, G: 0x00ff00ff, B: 0x0000ffff, W: 0xffffffff };

/** Baut eine schwebende Auswahl aus Textzeilen; '.' = nicht ausgewählt. */
function fl(rows: string[], colors: Record<string, number> = C): Floating {
  const h = rows.length, w = rows[0].length;
  const pixels = new Uint32Array(w * h), mask = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    pixels[y * w + x] = colors[ch]; mask[y * w + x] = 1;
  }));
  return { pixels, mask, w, h, x: 0, y: 0 };
}

const rowsOf = (p: Uint32Array, w: number): string[] => {
  const inv = Object.fromEntries(Object.entries(C).map(([k, v]) => [v, k]));
  const out: string[] = [];
  for (let i = 0; i < p.length; i += w) out.push([...p.slice(i, i + w)].map(v => inv[v] ?? (v === 0 ? '.' : '?')).join(''));
  return out;
};

describe('scaleFloating: vergrößern', () => {
  it('doubling repeats every pixel 2x2', () => {
    const r = scaleFloating(fl(['RG', 'BW']), 4, 4);
    expect(rowsOf(r.pixels, 4)).toEqual(['RRGG', 'RRGG', 'BBWW', 'BBWW']);
  });

  it('3 to 5 uses only source colors and spreads the rounding evenly', () => {
    const r = scaleFloating(fl(['RGB']), 5, 1);
    const s = rowsOf(r.pixels, 5)[0];
    expect(s).toMatch(/^[RGB]{5}$/);
    for (const ch of 'RGB') expect([1, 2]).toContain([...s].filter(c => c === ch).length);
  });

  it('keeps alpha unchanged when only enlarging', () => {
    const r = scaleFloating({ pixels: new Uint32Array([0xff000080]), mask: new Uint8Array([1]), w: 1, h: 1, x: 0, y: 0 }, 2, 2);
    expect([...r.pixels]).toEqual([0xff000080, 0xff000080, 0xff000080, 0xff000080]);
  });

  it('keeps the shape of a lasso mask when enlarging', () => {
    const base = fl(['R...', 'RR..', 'RRR.', 'RRRR']);
    const r = scaleFloating(base, 8, 8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      expect(r.mask[y * 8 + x]).toBe(base.mask[Math.floor(y / 2) * 4 + Math.floor(x / 2)]);
    }
  });

  it('same size returns the same pixels and zeroes pixels without mask', () => {
    const base: Floating = { pixels: new Uint32Array([C.R, C.G]), mask: new Uint8Array([1, 0]), w: 2, h: 1, x: 0, y: 0 };
    const r = scaleFloating(base, 2, 1);
    expect([...r.pixels]).toEqual([C.R, 0]);
    expect([...r.mask]).toEqual([1, 0]);
  });
});

describe('scaleFloating: verkleinern', () => {
  it('a checkerboard of two colors stays two colors, never a mix', () => {
    const r = scaleFloating(fl(['RGRG', 'GRGR', 'RGRG', 'GRGR']), 2, 2);
    for (const v of r.pixels) expect([C.R, C.G]).toContain(v);
  });

  it('the more frequent color wins (3:1)', () => {
    const r = scaleFloating(fl(['RRRG']), 1, 1);
    expect(r.pixels[0]).toBe(C.R);
  });

  it('mixed axes: crisp along the enlarged axis', () => {
    const r = scaleFloating(fl(['RG', 'BW']), 4, 1);
    expect(r.pixels[0]).toBe(r.pixels[1]);
    expect(r.pixels[2]).toBe(r.pixels[3]);
    expect(r.pixels[0]).not.toBe(r.pixels[2]);
  });

  it('a source with more than 256 colors is not mapped to its colors', () => {
    expect(MAX_SCALE_COLORS).toBe(256);
    const w = 20, h = 15, pixels = new Uint32Array(w * h), mask = new Uint8Array(w * h).fill(1);
    for (let i = 0; i < w * h; i++) pixels[i] = ((((i & 255) << 24) | ((i >> 8) << 16)) | 255) >>> 0;
    pixels[0] = 0x000000ff; pixels[1] = 0xfefefeff;
    const r = scaleFloating({ pixels, mask, w, h, x: 0, y: 0 }, 10, 15);
    expect(r.pixels[0]).toBe(0x7f7f7fff); // Mittel, nicht auf eine Quellfarbe gerastet
    for (const v of r.pixels) expect([0, 255]).toContain(v & 255);
  });

  it('half-transparent pixels become fully transparent or fully opaque', () => {
    const mk = (a: number): Floating => ({ pixels: new Uint32Array(4).fill((0xff0000 << 8 | a) >>> 0), mask: new Uint8Array(4).fill(1), w: 2, h: 2, x: 0, y: 0 });
    expect(scaleFloating(mk(100), 1, 1).pixels[0]).toBe(0);
    expect(scaleFloating(mk(200), 1, 1).pixels[0]).toBe(0xff0000ff);
  });

  it('lasso mask follows the half rule', () => {
    const r = scaleFloating(fl(['R...', 'RR..', 'RRR.', 'RRRR']), 2, 2);
    expect([...r.mask]).toEqual([1, 0, 1, 1]);
  });
});

describe('scaleFloating: Grenzen', () => {
  it('works down to 1x1 and up to 128x128', () => {
    const base = fl(['RG', 'BW']);
    expect(scaleFloating(base, 1, 1).pixels.length).toBe(1);
    const big = scaleFloating(base, 128, 128);
    expect(big.pixels.length).toBe(128 * 128);
    expect(big.mask.length).toBe(128 * 128);
  });

  it('throws a RangeError outside 1..128', () => {
    const base = fl(['RG']);
    expect(() => scaleFloating(base, 0, 5)).toThrow(RangeError);
    expect(() => scaleFloating(base, 129, 5)).toThrow(RangeError);
    expect(() => scaleFloating(base, 5, 0)).toThrow(RangeError);
  });
});
