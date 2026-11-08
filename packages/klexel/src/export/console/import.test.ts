import { describe, it, expect } from 'vitest';
import { writePico8 } from './pico8';
import { writePicotron } from './picotron';
import { readPico8, readPicotron, readConsoleFile, buildImportDoc, sheetLayout } from './import';
import type { ExportPlan, PlanSprite } from './plan';
import { PICO8 } from '../../palette/palettes';
import { PICOTRON } from '../../palette/picotron';

function sprite(index: number, size: number, fill: (i: number) => number): PlanSprite {
  const indices = new Uint8Array(size * size);
  for (let i = 0; i < indices.length; i++) indices[i] = fill(i);
  return { index, w: size, h: size, indices, mapped: new Uint32Array(size * size), original: new Uint32Array(size * size) };
}
const plan = (sprites: PlanSprite[]): ExportPlan => ({ sprites, adjusted: 0, issues: [], dropped: 0, blocked: false });

describe('PICO-8-Import', () => {
  const p = plan([sprite(1, 8, i => (i % 15) + 1), sprite(17, 8, () => 8)]);

  it('liest nur belegte Sprites mit Nummer und Pixeln zurück', () => {
    const s = readPico8(writePico8(p));
    expect(s.target).toBe('pico8');
    expect(s.sprites.map(x => x.index)).toEqual([1, 17]);
    expect([...s.sprites[0].indices]).toEqual([...p.sprites[0].indices]);
  });

  it('Blatt-Modus: Sprite 17 liegt in Zeile 2 (Nr. 16–31), Farbe aus der PICO-8-Palette, 0 durchsichtig', () => {
    const { doc } = buildImportDoc(readPico8(writePico8(p)), 'sheet');
    expect(doc.width).toBe(16 * 8);
    expect(doc.height).toBe(2 * 8); // nur bis zur letzten belegten Zeile
    expect(doc.data[8 * 128 + 8]).toBe(PICO8[8]);
    expect(doc.data[0]).toBe(0);
  });

  it('Frames-Modus: ein Frame je Sprite', () => {
    const { doc } = buildImportDoc(readPico8(writePico8(p)), 'frames');
    expect(doc.frames).toHaveLength(2);
    expect(doc.width).toBe(8);
    expect(doc.cel(1, doc.frames[1].id)![0]).toBe(PICO8[8]);
  });

  it('CRLF und gekürzte Zeilen werden vertragen', () => {
    const t = 'pico-8 cartridge // x\r\nversion 41\r\n__lua__\r\n__gfx__\r\n0000000000000001\r\n';
    expect(readPico8(t).sprites).toHaveLength(1);
  });

  it('ohne __gfx__ → Fehler', () => {
    expect(() => readPico8('pico-8 cartridge\n__lua__\n')).toThrow();
  });
});

describe('Picotron-Import', () => {
  const p = plan([sprite(3, 16, i => (i % 31) + 1), sprite(5, 16, () => 20)]);
  const bytes = writePicotron(p, 16, new Date(2026, 9, 18));

  it('Rundlauf mit dem Export: Index, Größe und Pixel stimmen', () => {
    const s = readPicotron(bytes);
    expect(s.target).toBe('picotron');
    expect(s.sprites.map(x => [x.index, x.w, x.h])).toEqual([[3, 16, 16], [5, 16, 16]]);
    expect([...s.sprites[0].indices]).toEqual([...p.sprites[0].indices]);
  });

  it('Farben aus der Picotron-Palette (Index 20)', () => {
    const { doc } = buildImportDoc(readConsoleFile(bytes), 'frames');
    expect(doc.frames).toHaveLength(2);
    expect(doc.cel(1, doc.frames[1].id)![0]).toBe(PICOTRON[20]);
  });

  it('Blatt-Modus passt in 128 und meldet abgeschnittene Sprites', () => {
    const s = readPicotron(writePicotron(plan([sprite(200, 16, () => 1)]), 16));
    const l = sheetLayout(s);
    expect(l.width).toBeLessThanOrEqual(128);
    expect(l.height).toBeLessThanOrEqual(128);
    expect(l.cut).toBe(1);
  });

  it('Müll → Fehler', () => {
    expect(() => readConsoleFile(new TextEncoder().encode('hallo'))).toThrow();
  });
});

describe('Picotron-Import: komprimierte Bitmaps (pxu, Move-to-front)', () => {
  // Echte Daten aus einer von Picotron gespeicherten 0.gfx: 16×16, ein „X“ in Farbe 7
  const bmp = [0x70, 0x78, 0x75, 0x00, 0x43, 0x20, 0x10, 0x10, 0x04,
    0xf0, 0x56, 0x07, 0x10, 0x07, 0xc0, 0x17, 0xd0, 0x17, 0xc0, 0x07, 0x10, 0x07, 0xf0, 0x56];
  const file = Uint8Array.from([
    ...new TextEncoder().encode('--[[pod,created="2025-01-17 10:35:48",revision=19]]{[0]={bmp='),
    ...bmp, ...new TextEncoder().encode(',flags=0,pan_x=0,pan_y=0,zoom=8}}'),
  ]);

  it('entpackt das Bitmap zu den richtigen Pixeln', () => {
    const s = readPicotron(file);
    expect(s.sprites).toHaveLength(1);
    const { w, h, indices } = s.sprites[0];
    expect([w, h]).toEqual([16, 16]);
    expect([...indices].reduce((n, v) => n + (v === 7 ? 1 : 0), 0)).toBe(8);
    expect(indices[6 * 16 + 6]).toBe(7);
    expect(indices[6 * 16 + 9]).toBe(7);
    expect(indices[0]).toBe(0);
  });
});
