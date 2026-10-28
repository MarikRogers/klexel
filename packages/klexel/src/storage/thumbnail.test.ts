import { describe, it, expect } from 'vitest';
import { thumbnailPixels } from './thumbnail';

describe('thumbnailPixels', () => {
  it('verkleinert 128x64 auf 48x24', () => {
    const t = thumbnailPixels(new Uint32Array(128 * 64), 128, 64, 48);
    expect([t.w, t.h]).toEqual([48, 24]);
    expect(t.rgba.length).toBe(48 * 24 * 4);
  });
  it('lässt 8x8 unverändert und entpackt RGBA', () => {
    const p = new Uint32Array(64);
    p[0] = 0x11223344;
    const t = thumbnailPixels(p, 8, 8);
    expect([t.w, t.h]).toEqual([8, 8]);
    expect(Array.from(t.rgba.slice(0, 4))).toEqual([0x11, 0x22, 0x33, 0x44]);
  });
});
