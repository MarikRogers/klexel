import { describe, it, expect } from 'vitest';
import { PixelDocument, type Layer } from '../model/Document';
import { serializeState, parseState } from './state';

function layer(id: number, over: Partial<Layer> = {}): Layer {
  return { id, name: `L${id}`, visible: true, locked: false, opacity: 100, cels: new Map([[1, new Uint32Array(4)]]), ...over };
}

// Gespeichertes v2-Format: pro Ebene ein Feld `data`
function rawLayer(id: number): any {
  return { id, name: `L${id}`, visible: true, locked: false, opacity: 100, data: new Uint32Array(4) };
}

function validRaw(): any {
  return {
    version: 2, width: 2, height: 2,
    layers: [rawLayer(1), rawLayer(2)],
    activeId: 1, nextId: 3, palette: [1, 2], color: 1,
  };
}

describe('state', () => {
  it('Roundtrip mit 3 Ebenen', () => {
    const a = layer(1, { name: 'Hintergrund', opacity: 40 });
    a.cels.get(1)![1] = 0xff0000ff;
    const b = layer(2, { name: 'Mitte', visible: false });
    const c = layer(5, { name: 'Oben', locked: true, opacity: 0 });
    c.cels.get(1)![3] = 0x00ff00ff;
    const doc = PixelDocument.restore({ width: 2, height: 2, frames: [{ id: 1 }], currentFrameId: 1, nextFrameId: 2, layers: [a, b, c], activeId: 2, nextId: 6 });
    const r = parseState(serializeState(doc, [10, 20, 30], 20))!;
    expect(r).not.toBeNull();
    expect(r.doc.width).toBe(2);
    expect(r.doc.height).toBe(2);
    expect(r.doc.layers).toEqual(doc.layers);
    expect(r.doc.activeId).toBe(2);
    expect(r.doc.nextId).toBe(6);
    expect(r.palette).toEqual([10, 20, 30]);
    expect(r.color).toBe(20);
  });

  it('Migration vom alten Format', () => {
    const data = new Uint32Array(16);
    data[5] = 7;
    const r = parseState({ width: 4, height: 4, data, palette: [1, 2], color: 1 })!;
    expect(r).not.toBeNull();
    expect(r.doc.layers).toHaveLength(1);
    const l = r.doc.layers[0];
    expect(l.name).toBe('Ebene 1');
    expect(l.opacity).toBe(100);
    expect(l.visible).toBe(true);
    expect(l.locked).toBe(false);
    expect(r.doc.cel(l.id, 1)![5]).toBe(7);
    expect(r.palette).toEqual([1, 2]);
    expect(r.color).toBe(1);
  });

  it('Beschädigte Stände ergeben null', () => {
    const bad: unknown[] = [];
    const mk = (f: (s: any) => void) => { const s = validRaw(); f(s); bad.push(s); };
    mk((s) => { s.layers[0].data = new Uint32Array(3); });
    mk((s) => { s.layers = []; });
    mk((s) => { s.layers = Array.from({ length: 17 }, (_, i) => rawLayer(i + 1)); });
    mk((s) => { s.layers[1].id = 1; });
    mk((s) => { s.activeId = 9; });
    mk((s) => { s.layers[0].opacity = 101; });
    mk((s) => { s.layers[0].opacity = 1.5; });
    mk((s) => { s.width = 0; });
    mk((s) => { s.palette = 'x'; });
    bad.push(null, undefined, 'foo');
    for (const b of bad) expect(parseState(b)).toBeNull();
  });

  it('korrigiert zu kleines nextId', () => {
    const s = validRaw();
    s.layers = [rawLayer(1), rawLayer(7)];
    s.nextId = 2;
    expect(parseState(s)!.doc.nextId).toBe(8);
  });
});
