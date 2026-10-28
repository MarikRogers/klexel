import { describe, it, expect } from 'vitest';
import { reducePixels, TARGET_PALETTE } from './reduce';
import { PICO8 } from '../../palette/palettes';
import { PICOTRON } from '../../palette/picotron';

describe('Paletten', () => {
  it('haben die richtige Größe', () => {
    expect(PICO8.length).toBe(16);
    expect(PICOTRON.length).toBe(32);
    expect(TARGET_PALETTE.pico8).toBe(PICO8);
    expect(TARGET_PALETTE.picotron).toBe(PICOTRON);
  });
});

describe('Picotron-Palette: Indexreihenfolge wie im Sprite-Blatt von Picotron', () => {
  it('Indizes 0–15 entsprechen der PICO-8-Palette', () => {
    expect(PICOTRON.slice(0, 16)).toEqual(PICO8);
  });
  it('Stichproben 16 und 31 (laut Screenshot des Sprite-Blatts)', () => {
    expect(PICOTRON[16]).toBe(0x2463b0ff);
    expect(PICOTRON[24]).toBe(0xb9003eff);
    expect(PICOTRON[31]).toBe(0xf49671ff);
  });
});

describe('reducePixels', () => {
  it('exakte Palettenfarbe bleibt unverändert', () => {
    const r = reducePixels(Uint32Array.of(PICO8[8]), PICO8);
    expect([...r.indices]).toEqual([8]);
    expect(r.adjusted.size).toBe(0);
    expect(r.mapped[0]).toBe(PICO8[8]);
  });

  it('abweichende Farbe geht auf die nächste Palettenfarbe und wird gezählt', () => {
    const r = reducePixels(Uint32Array.of(0xff0000ff), PICO8);
    expect(r.indices[0]).toBe(8); // #ff004d
    expect(r.adjusted.has(0xff0000ff)).toBe(true);
    expect(r.mapped[0]).toBe(PICO8[8]);
  });

  it('Alpha < 128 ist transparent: Index 0, nicht angepasst', () => {
    const r = reducePixels(Uint32Array.of(0xff00007f), PICO8);
    expect(r.indices[0]).toBe(0);
    expect(r.adjusted.size).toBe(0);
    expect(r.mapped[0]).toBe(0);
  });

  it('Alpha 128 gilt als deckend', () => {
    const r = reducePixels(Uint32Array.of(0xff000080), PICO8);
    expect(r.indices[0]).toBe(8);
  });

  it('deckendes Schwarz wird nicht durchsichtig', () => {
    const r = reducePixels(Uint32Array.of(0x000000ff), PICO8);
    expect(r.indices[0]).not.toBe(0);
    expect(r.adjusted.has(0x000000ff)).toBe(true);
    expect(r.mapped[0]).not.toBe(PICO8[0]);
  });

  it('dieselbe angepasste Farbe zählt einmal', () => {
    const r = reducePixels(Uint32Array.of(0xff0000ff, 0xff0000ff), PICO8);
    expect(r.adjusted.size).toBe(1);
  });
});
