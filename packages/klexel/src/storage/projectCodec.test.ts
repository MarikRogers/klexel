import { describe, it, expect } from 'vitest';
import { PixelDocument, type Layer } from '../model/Document';
import { encodeKlexel, decodeKlexel } from './projectCodec';

function layer(id: number, over: Partial<Layer> = {}): Layer {
  return { id, name: `L${id}`, visible: true, locked: false, opacity: 100, cels: new Map([[1, new Uint32Array(4)]]), ...over };
}

describe('projectCodec', () => {
  it('Round-Trip erhält Ebenen, Frames und Palette', () => {
    const a = layer(1, { name: 'Hintergrund', cels: new Map([[1, new Uint32Array(4)], [2, new Uint32Array(4)]]) });
    a.cels.get(2)![1] = 0xff0000ff;
    const b = layer(2, { name: 'Oben', opacity: 50, cels: new Map([[1, new Uint32Array(4)]]) });
    const doc = PixelDocument.restore({
      width: 2, height: 2, frames: [{ id: 1 }, { id: 2 }], currentFrameId: 2, nextFrameId: 3,
      layers: [a, b], activeId: 2, nextId: 3, fps: 10, onion: true,
    });
    const r = decodeKlexel(encodeKlexel(doc, [1, 2, 3], 2))!;
    expect(r).not.toBeNull();
    expect(r.doc.layers).toEqual(doc.layers);
    expect(r.doc.frames).toEqual([{ id: 1 }, { id: 2 }]);
    expect(r.palette).toEqual([1, 2, 3]);
    expect(r.color).toBe(2);
  });

  it('lädt ein v2-Fixture', () => {
    const l = { id: 1, name: 'L1', visible: true, locked: false, opacity: 100, data: new Uint32Array(4) };
    const r = decodeKlexel({ version: 2, width: 2, height: 2, layers: [l], activeId: 1, nextId: 2, palette: [1], color: 1 })!;
    expect(r.doc.frames).toEqual([{ id: 1 }]);
  });

  it('lädt ein v1-Fixture (ohne version)', () => {
    const r = decodeKlexel({ width: 4, height: 4, data: new Uint32Array(16), palette: [1], color: 1 })!;
    expect(r.doc.layers).toHaveLength(1);
  });

  it('liefert null bei Unsinn', () => {
    expect(decodeKlexel('x')).toBeNull();
  });
});
