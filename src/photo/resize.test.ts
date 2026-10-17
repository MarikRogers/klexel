import { describe, it, expect } from 'vitest';
import { keepSize, cropRect, boxResize, resizePhoto, type PhotoImage } from './resize';

function img(w: number, h: number, f: (x: number, y: number) => number): PhotoImage {
  const pixels = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels[y * w + x] = f(x, y) >>> 0;
  return { width: w, height: h, pixels };
}
const RED = 0xff0000ff;

describe('keepSize', () => {
  it('längste Seite wird vorgegeben, die andere folgt dem Verhältnis', () => {
    expect(keepSize(4000, 3000, 32)).toEqual({ width: 32, height: 24 });
    expect(keepSize(3000, 4000, 32)).toEqual({ width: 24, height: 32 });
  });
  it('andere Seite ist mindestens 1', () => {
    expect(keepSize(8000, 10, 32)).toEqual({ width: 32, height: 1 });
  });
  it('klemmt auf 1..128', () => {
    expect(keepSize(10, 10, 500)).toEqual({ width: 128, height: 128 });
    expect(keepSize(1, 1, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe('cropRect', () => {
  it('größter Ausschnitt im Zielverhältnis, Position über pan', () => {
    expect(cropRect(400, 300, 32, 32, 0.5, 0.5)).toEqual({ x: 50, y: 0, w: 300, h: 300 });
    expect(cropRect(400, 300, 32, 32, 0, 0.5).x).toBe(0);
    expect(cropRect(400, 300, 32, 32, 1, 0.5).x).toBe(100);
    expect(cropRect(300, 400, 32, 32, 0.5, 1)).toEqual({ x: 0, y: 100, w: 300, h: 300 });
    expect(cropRect(100, 100, 64, 32, 0.5, 0.5)).toEqual({ x: 0, y: 25, w: 100, h: 50 });
  });
  it('klemmt pan auf 0..1', () => {
    expect(cropRect(400, 300, 32, 32, 7, 0.5).x).toBe(100);
    expect(cropRect(400, 300, 32, 32, -3, 0.5).x).toBe(0);
  });
});

describe('boxResize', () => {
  it('2×2 deckend → 1×1 ist der RGB-Durchschnitt', () => {
    const src = img(2, 2, (x, y) => [0x000000ff, 0x640000ff, 0x006400ff, 0x000064ff][y * 2 + x]);
    const out = boxResize(src, { x: 0, y: 0, w: 2, h: 2 }, 1, 1);
    expect(out[0]).toBe(0x191919ff); // (0+100+0+0)/4 = 25 je Kanal
  });
  it('transparente Pixel zählen nicht zum RGB, wohl zum Alpha', () => {
    const src = img(2, 2, (_x, y) => (y === 0 ? 0 : RED));
    const out = boxResize(src, { x: 0, y: 0, w: 2, h: 2 }, 1, 1);
    expect(out[0]).toBe(0xff000080); // Alpha 510/4 = 127.5 → 128
  });
  it('komplett transparent bleibt 0', () => {
    const out = boxResize(img(4, 4, () => 0), { x: 0, y: 0, w: 4, h: 4 }, 2, 2);
    expect([...out]).toEqual([0, 0, 0, 0]);
  });
  it('1×1 hochskaliert auf 4×4: alle Pixel gleich', () => {
    const out = boxResize(img(1, 1, () => 0x336699ff), { x: 0, y: 0, w: 1, h: 1 }, 4, 4);
    expect(out).toHaveLength(16);
    expect([...out].every(v => v === 0x336699ff)).toBe(true);
  });
  it('gebrochene Rechtecke liefern ganze Zahlen ohne NaN', () => {
    const src = img(4, 4, (x, y) => 0x10203040 + x * 0x01000000 + y);
    const out = boxResize(src, { x: 0.5, y: 0.25, w: 3.1, h: 2.7 }, 3, 3);
    expect([...out].every(v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)).toBe(true);
  });
});

describe('resizePhoto', () => {
  it('fit: Hochformat bleibt ganz, Ränder links und rechts transparent, Foto mittig', () => {
    const out = resizePhoto(img(100, 200, () => RED), { mode: 'fit', width: 32, height: 32, longest: 32, panX: 0.5, panY: 0.5 });
    expect(out.width).toBe(32); expect(out.height).toBe(32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 8; x++) expect(out.pixels[y * 32 + x]).toBe(0);
      for (let x = 24; x < 32; x++) expect(out.pixels[y * 32 + x]).toBe(0);
      for (let x = 8; x < 24; x++) expect(out.pixels[y * 32 + x]).toBe(RED);
    }
  });
  it('crop: füllt die Zielgröße ohne transparente Pixel', () => {
    const out = resizePhoto(img(400, 300, () => RED), { mode: 'crop', width: 32, height: 32, longest: 32, panX: 0.5, panY: 0.5 });
    expect(out.width).toBe(32); expect(out.height).toBe(32);
    expect([...out.pixels].every(v => v === RED)).toBe(true);
  });
  it('keep: 400×300 mit längster Seite 32 → 32×24', () => {
    const out = resizePhoto(img(400, 300, () => RED), { mode: 'keep', width: 5, height: 5, longest: 32, panX: 0, panY: 0 });
    expect(out.width).toBe(32); expect(out.height).toBe(24);
  });
  it('Foto kleiner als das Ziel wird hochskaliert, kein NaN', () => {
    const out = resizePhoto(img(1, 1, () => RED), { mode: 'crop', width: 16, height: 16, longest: 16, panX: 0.5, panY: 0.5 });
    expect([...out.pixels].every(v => v === RED)).toBe(true);
  });
  it('komplett transparentes Foto bleibt komplett transparent', () => {
    const out = resizePhoto(img(8, 8, () => 0), { mode: 'fit', width: 4, height: 4, longest: 4, panX: 0.5, panY: 0.5 });
    expect([...out.pixels].every(v => v === 0)).toBe(true);
  });
});
