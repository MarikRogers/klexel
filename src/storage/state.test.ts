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

// Gespeichertes v3-Format
function rawLayer3(id: number, cels: Record<string, Uint32Array> = { '1': new Uint32Array(4) }): any {
  return { id, name: `L${id}`, visible: true, locked: false, opacity: 100, cels };
}

function validRaw3(): any {
  return {
    version: 3, width: 2, height: 2,
    frames: [{ id: 1 }, { id: 2 }], currentFrameId: 1, nextFrameId: 3,
    layers: [rawLayer3(1), rawLayer3(2)],
    activeId: 1, nextId: 3, fps: 8, onion: false, palette: [1, 2], color: 1,
  };
}

describe('state', () => {
  it('Roundtrip v3', () => {
    const a = layer(1, { name: 'Hintergrund', opacity: 40, cels: new Map([[1, new Uint32Array(4)], [2, new Uint32Array(4)]]) });
    a.cels.get(1)![1] = 0xff0000ff;
    a.cels.get(2)![0] = 0x11223344;
    const b = layer(2, { name: 'Mitte', visible: false, cels: new Map() });
    const c = layer(5, { name: 'Oben', locked: true, opacity: 0, cels: new Map([[2, new Uint32Array(4)]]) });
    c.cels.get(2)![3] = 0x00ff00ff;
    const doc = PixelDocument.restore({
      width: 2, height: 2, frames: [{ id: 1 }, { id: 2 }], currentFrameId: 2, nextFrameId: 3,
      layers: [a, b, c], activeId: 2, nextId: 6, fps: 12, onion: true,
    });
    const r = parseState(serializeState(doc, [10, 20, 30], 20))!;
    expect(r).not.toBeNull();
    expect(r.doc.width).toBe(2);
    expect(r.doc.height).toBe(2);
    expect(r.doc.layers).toEqual(doc.layers);
    expect(r.doc.layers[1].cels.size).toBe(0);
    expect(r.doc.layers[2].cels.has(1)).toBe(false);
    expect(r.doc.frames).toEqual([{ id: 1 }, { id: 2 }]);
    expect(r.doc.currentFrameId).toBe(2);
    expect(r.doc.nextFrameId).toBe(3);
    expect(r.doc.fps).toBe(12);
    expect(r.doc.onion).toBe(true);
    expect(r.doc.activeId).toBe(2);
    expect(r.doc.nextId).toBe(6);
    expect(r.palette).toEqual([10, 20, 30]);
    expect(r.color).toBe(20);
  });

  it('serializeState kopiert die Cels und nur vorhandene', () => {
    const doc = new PixelDocument(2, 2);
    doc.set(0, 0, 5);
    const s = serializeState(doc, [1], 1);
    expect(s.version).toBe(3);
    expect(Object.keys(s.layers[0].cels)).toEqual(['1']);
    doc.set(0, 0, 9);
    expect(s.layers[0].cels['1'][0]).toBe(5);
    const empty = serializeState(new PixelDocument(2, 2), [1], 1);
    expect(empty.layers[0].cels).toEqual({});
  });

  it('Migration v2', () => {
    const s = validRaw();
    s.layers[1].data[2] = 9;
    const r = parseState(s)!;
    expect(r).not.toBeNull();
    expect(r.doc.frames).toEqual([{ id: 1 }]);
    expect(r.doc.currentFrameId).toBe(1);
    expect(r.doc.nextFrameId).toBe(2);
    expect(r.doc.fps).toBe(8);
    expect(r.doc.onion).toBe(false);
    expect(r.doc.cel(2, 1)![2]).toBe(9);
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
    expect(r.doc.frames).toEqual([{ id: 1 }]);
    expect(r.doc.fps).toBe(8);
    expect(r.doc.onion).toBe(false);
    expect(r.palette).toEqual([1, 2]);
    expect(r.color).toBe(1);
  });

  it('Beschädigte v2-Stände ergeben null', () => {
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

  it('Beschädigte v3-Stände ergeben null', () => {
    expect(parseState(validRaw3())).not.toBeNull();
    const bad: unknown[] = [];
    const mk = (f: (s: any) => void) => { const s = validRaw3(); f(s); bad.push(s); };
    mk((s) => { s.layers[0].cels['9'] = new Uint32Array(4); });
    mk((s) => { s.layers[0].cels['x'] = new Uint32Array(4); });
    mk((s) => { s.layers[0].cels['1.5'] = new Uint32Array(4); });
    mk((s) => { s.layers[0].cels['1'] = new Uint32Array(3); });
    mk((s) => { s.layers[0].cels['1'] = [0, 0, 0, 0]; });
    mk((s) => { s.layers[0].cels = null; });
    mk((s) => { s.frames = []; });
    mk((s) => { s.frames = Array.from({ length: 65 }, (_, i) => ({ id: i + 1 })); });
    mk((s) => { s.frames = [{ id: 1 }, { id: 1 }]; });
    mk((s) => { s.frames = [{ id: 0 }, { id: 2 }]; });
    mk((s) => { s.frames = [{ id: 1.5 }, { id: 2 }]; });
    mk((s) => { s.frames = 'x'; });
    mk((s) => { s.currentFrameId = 7; });
    mk((s) => { s.fps = 0; });
    mk((s) => { s.fps = 31; });
    mk((s) => { s.fps = 1.5; });
    mk((s) => { s.fps = '8'; });
    mk((s) => { s.onion = 1; });
    mk((s) => { s.onion = 'true'; });
    mk((s) => {
      s.width = 128; s.height = 128;
      s.frames = Array.from({ length: 62 }, (_, i) => ({ id: i + 1 }));
      s.layers = Array.from({ length: 16 }, (_, i) => rawLayer3(i + 1, {}));
      s.nextId = 17; s.nextFrameId = 63;
    });
    mk((s) => { s.layers[0].opacity = 101; });
    mk((s) => { s.activeId = 9; });
    for (const b of bad) expect(parseState(b)).toBeNull();
  });

  it('korrigiert zu kleines nextId', () => {
    const s = validRaw();
    s.layers = [rawLayer(1), rawLayer(7)];
    s.nextId = 2;
    expect(parseState(s)!.doc.nextId).toBe(8);
  });

  it('korrigiert zu kleines nextFrameId (v3)', () => {
    const s = validRaw3();
    s.frames = [{ id: 1 }, { id: 7 }];
    s.nextFrameId = 2;
    expect(parseState(s)!.doc.nextFrameId).toBe(8);
  });

  it('parseState-Ergebnisse teilen keine frames', () => {
    const a = parseState(validRaw())!.doc;
    const b = parseState(validRaw())!.doc;
    expect(a.frames).not.toBe(b.frames);
    a.insertFrame(a.createFrame(), 1);
    expect(b.frames).toEqual([{ id: 1 }]);
    expect(parseState(validRaw())!.doc.frames).toEqual([{ id: 1 }]);
  });
});
