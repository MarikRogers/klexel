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

/** Entpackt einen einzelnen LZ4-Block (wie Picotron ihn im Pod-Container ablegt). */
function unlz4(src: Uint8Array, usize: number): Uint8Array {
  const out = new Uint8Array(usize);
  let p = 0, o = 0;
  while (p < src.length) {
    const t = src[p++];
    let l = t >> 4;
    if (l === 15) { let b: number; do { b = src[p++]; l += b; } while (b === 255); }
    for (let i = 0; i < l; i++) out[o++] = src[p++];
    if (p >= src.length) break;
    const off = src[p] | (src[p + 1] << 8); p += 2;
    let m = t & 15;
    if (m === 15) { let b: number; do { b = src[p++]; m += b; } while (b === 255); }
    m += 4;
    for (let i = 0; i < m; i++) { out[o] = out[o - off]; o++; }
  }
  return out;
}

/** Zerlegt die Datei in Kopfzeile und entpackten Pod-Inhalt. */
function parse(file: Uint8Array): { header: string; body: Uint8Array } {
  const text = new TextDecoder('latin1').decode(file);
  const end = text.indexOf(']]') + 2;
  const header = text.slice(0, end);
  expect(text.slice(end, end + 4)).toBe('lz4\0');
  const dv = new DataView(file.buffer, file.byteOffset + end + 4, 8);
  const csize = dv.getUint32(0, true), usize = dv.getUint32(4, true);
  expect(file.length).toBe(end + 12 + csize);
  return { header, body: unlz4(file.subarray(end + 12), usize) };
}

const latin = (b: Uint8Array, from = 0, to = b.length) => new TextDecoder('latin1').decode(b.subarray(from, to));
const PXU16 = 'pxu\0\x43\x10\x10\x10'; // pxu, Typ 2D-u8, RAW, Breite 16, Höhe 16

describe('writePicotron', () => {
  const now = new Date(2026, 9, 18, 14, 5, 9);

  it('Kopfzeile mit Zeitstempel, danach LZ4-Container mit stimmenden Größen', () => {
    const { header, body } = parse(writePicotron(plan([sprite(1, 16, [1, 2])]), 16, now));
    expect(header).toBe('--[[pod,created="2026-10-18 14:05:09",modified="2026-10-18 14:05:09",revision=1]]');
    expect(latin(body, 0, 5)).toBe('{[0]=');
    expect(latin(body, body.length - 1)).toBe('}');
  });

  it('256 Einträge, jeder mit pxu-Bitmap, flags und pan/zoom', () => {
    const { body } = parse(writePicotron(plan([sprite(1, 16, [1, 2])]), 16, now));
    const text = latin(body);
    expect(text.split('bmp=pxu\0').length - 1).toBe(256);
    expect(text.split(',flags=0,pan_x=0,pan_y=0,zoom=8}').length - 1).toBe(256);
  });

  it('belegtes Sprite steht an seinem Index: RAW-Pixel, ein Byte je Pixel', () => {
    const { body } = parse(writePicotron(plan([sprite(3, 16, [5, 6])]), 16, now));
    const text = latin(body);
    const starts: number[] = [];
    for (let i = text.indexOf('bmp='); i >= 0; i = text.indexOf('bmp=', i + 1)) starts.push(i);
    expect(starts).toHaveLength(256);
    const at = (n: number) => starts[n] + 4; // hinter "bmp="
    expect(text.slice(at(3), at(3) + PXU16.length)).toBe(PXU16);
    expect(body[at(3) + PXU16.length]).toBe(5);
    expect(body[at(3) + PXU16.length + 1]).toBe(6);
    expect(body[at(2) + PXU16.length]).toBe(0); // anderer Eintrag leer
    expect(text.slice(at(3) + PXU16.length + 256, at(3) + PXU16.length + 256 + 8)).toBe(',flags=0');
  });

  it('andere Spritegröße: Breite und Höhe im Kopf des Bitmaps', () => {
    const { body } = parse(writePicotron(plan([sprite(1, 8, [1])]), 8, now));
    expect(latin(body)).toContain('bmp=pxu\0\x43\x10\x08\x08');
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
