import { describe, it, expect } from 'vitest';
import { compositeLayers, blendOver } from './composite';

const A = new Uint32Array([0xff0000ff, 0x00ff0080, 0, 0x0000ffff]);
const B = new Uint32Array([0x00ff00ff, 0x0000ff40, 0x12345678, 0]);

describe('compositeLayers', () => {
  it('leere Ebenenliste ergibt nur Nullen', () => {
    expect([...compositeLayers([], 4)]).toEqual([0, 0, 0, 0]);
  });
  it('fehlende Cel ist transparent', () => {
    expect([...compositeLayers([{ visible: true, opacity: 100 }], 3)]).toEqual([0, 0, 0]);
    expect([...compositeLayers([{ visible: true, opacity: 100 }, { visible: true, opacity: 100, cel: A }], 4)]).toEqual([...A]);
  });
  it('Cel mit falscher Länge wird ignoriert', () => {
    expect([...compositeLayers([{ visible: true, opacity: 100, cel: new Uint32Array(2).fill(1) }], 4)]).toEqual([0, 0, 0, 0]);
  });
  it('ausgeblendete Ebene wird übersprungen', () => {
    const r = compositeLayers([{ visible: true, opacity: 100, cel: A }, { visible: false, opacity: 100, cel: B }], 4);
    expect([...r]).toEqual([...A]);
  });
  it('Deckkraft 0 lässt die untere Ebene unverändert', () => {
    const r = compositeLayers([{ visible: true, opacity: 100, cel: A }, { visible: true, opacity: 0, cel: B }], 4);
    expect([...r]).toEqual([...A]);
  });
  it('Deckkraft 50 mischt wie blendOver', () => {
    const r = compositeLayers([{ visible: true, opacity: 100, cel: A }, { visible: true, opacity: 50, cel: B }], 4);
    for (let i = 0; i < 4; i++) {
      const base = A[i] === 0 ? 0 : A[i];
      expect(r[i]).toBe(B[i] === 0 ? base : blendOver(base, B[i], 50));
    }
  });
  it('drei sichtbare Ebenen stimmen mit einer Referenzschleife auf Basis von blendOver überein', () => {
    const C = new Uint32Array([0x80808080, 0xff00ffff, 0x01020304, 0]);
    const layers = [
      { visible: true, opacity: 100, cel: A },
      { visible: true, opacity: 50, cel: B },
      { visible: true, opacity: 33, cel: C },
    ];
    const expected = new Uint32Array(4);
    for (const l of layers) for (let i = 0; i < 4; i++) if (l.cel[i] !== 0) expected[i] = blendOver(expected[i], l.cel[i], l.opacity);
    expect([...compositeLayers(layers, 4)]).toEqual([...expected]);
  });
});
