import { describe, it, expect } from 'vitest';
import { PixelDocument, MAX_FRAMES, MAX_LAYERS, frameActions, type Layer } from './Document';

function addFrames(doc: PixelDocument, n: number): void {
  for (let i = 0; i < n; i++) doc.insertFrame(doc.createFrame(), doc.frames.length);
}

function state(over: Record<string, unknown> = {}) {
  const layer: Layer = { id: 1, name: 'Ebene 1', visible: true, locked: false, opacity: 100, cels: new Map([[1, new Uint32Array(4)]]) };
  return { width: 2, height: 2, frames: [{ id: 1 }], currentFrameId: 1, nextFrameId: 2, layers: [layer], activeId: 1, nextId: 2, ...over } as any;
}

describe('Frame-Modell', () => {
  it('neues Dokument: ein Frame id 1, currentFrameId 1, nextFrameId 2, fps 8, onion false', () => {
    const doc = new PixelDocument(4, 4);
    expect(doc.frames).toEqual([{ id: 1 }]);
    expect(doc.currentFrameId).toBe(1);
    expect(doc.nextFrameId).toBe(2);
    expect(doc.fps).toBe(8);
    expect(doc.onion).toBe(false);
  });

  it('get legt keine Cel an, set legt sie an', () => {
    const doc = new PixelDocument(3, 3);
    expect(doc.get(0, 0)).toBe(0);
    expect(doc.cel(1, 1)).toBeUndefined();
    doc.set(1, 1, 5);
    expect(doc.cel(1, 1)).toBeDefined();
    expect(doc.get(1, 1)).toBe(5);
  });

  it('Frame-IDs werden nie wiederverwendet', () => {
    const doc = new PixelDocument(2, 2);
    const f = doc.createFrame();
    expect(f.id).toBe(2);
    doc.insertFrame(f, 1);
    doc.removeFrame(f.id);
    expect(doc.createFrame().id).toBe(3);
  });

  it('Grenzen', () => {
    const doc = new PixelDocument(2, 2);
    expect(() => doc.removeFrame(1)).toThrow(RangeError);
    addFrames(doc, MAX_FRAMES - 1);
    expect(doc.frames.length).toBe(MAX_FRAMES);
    expect(() => doc.insertFrame(doc.createFrame(), 0)).toThrow(RangeError);
    doc.moveFrame(1, 999);
    expect(doc.frames[MAX_FRAMES - 1].id).toBe(1);
    doc.moveFrame(1, -5);
    expect(doc.frames[0].id).toBe(1);
  });

  it('removeFrame liefert Cels je Ebene; restoreFrameCels stellt sie wieder her', () => {
    const doc = new PixelDocument(2, 2);
    const l2 = doc.createLayer();
    doc.insertLayer(l2, 1);
    addFrames(doc, 1);
    doc.ensureCel(1, 2)[0] = 7;
    const { frame, index, cels } = doc.removeFrame(2);
    expect(index).toBe(1);
    expect(cels.get(1)![0]).toBe(7);
    expect(cels.get(l2.id)).toBeUndefined();
    expect(doc.cel(1, 2)).toBeUndefined();
    doc.insertFrame(frame, index);
    doc.restoreFrameCels(2, cels);
    expect(doc.cel(1, 2)![0]).toBe(7);
    expect(doc.cel(l2.id, 2)).toBeUndefined();
  });

  it('compositeFrame: je Frame ein Bild, Cache pro Frame', () => {
    const doc = new PixelDocument(2, 1);
    addFrames(doc, 1);
    doc.set(0, 0, 0xff0000ff);
    doc.setCurrentFrame(2);
    doc.set(1, 0, 0x00ff00ff);
    expect([...doc.compositeFrame(1)]).toEqual([0xff0000ff, 0]);
    expect([...doc.compositeFrame(2)]).toEqual([0, 0x00ff00ff]);
    const f1 = doc.compositeFrame(1);
    const f2 = doc.compositeFrame(2);
    doc.set(0, 0, 0x0000ffff);
    expect(doc.compositeFrame(2)).not.toBe(f2);
    expect(doc.compositeFrame(2)[0]).toBe(0x0000ffff);
    expect(doc.compositeFrame(1)).toBe(f1);
    doc.touch(1);
    expect(doc.compositeFrame(1)).not.toBe(f1);
    const a = doc.compositeFrame(1);
    const b = doc.compositeFrame(2);
    doc.touch();
    expect(doc.compositeFrame(1)).not.toBe(a);
    expect(doc.compositeFrame(2)).not.toBe(b);
    expect(doc.composite()).toBe(doc.compositeFrame(2));
  });

  it('fehlende Cels sind transparent', () => {
    const doc = new PixelDocument(2, 2);
    addFrames(doc, 1);
    expect([...doc.compositeFrame(2)]).toEqual([0, 0, 0, 0]);
  });

  it('Budget', () => {
    const doc = new PixelDocument(128, 128);
    while (doc.layers.length < MAX_LAYERS) doc.insertLayer(doc.createLayer(), doc.layers.length);
    addFrames(doc, 60);
    expect(doc.frames.length).toBe(61);
    expect(doc.fitsBudget(0, 1)).toBe(false);
    expect(frameActions(doc).canAdd).toBe(false);
    expect(frameActions(doc).canDuplicate).toBe(false);
    expect(() => doc.insertFrame(doc.createFrame(), 0)).toThrow(RangeError);
    const small = new PixelDocument(4, 4);
    expect(small.fitsBudget(0, 1)).toBe(true);
    expect(frameActions(small).canAdd).toBe(true);
  });

  it('restore: gültiger Zustand', () => {
    const l: Layer = { id: 3, name: 'x', visible: true, locked: false, opacity: 50, cels: new Map([[2, Uint32Array.of(1, 2, 3, 4)]]) };
    const doc = PixelDocument.restore(state({ frames: [{ id: 1 }, { id: 2 }], currentFrameId: 2, nextFrameId: 3, layers: [l], activeId: 3, nextId: 4, fps: 12, onion: true }));
    expect(doc.frames).toEqual([{ id: 1 }, { id: 2 }]);
    expect(doc.currentFrameId).toBe(2);
    expect(doc.cel(3, 2)).toEqual(Uint32Array.of(1, 2, 3, 4));
    expect(doc.cel(3, 1)).toBeUndefined();
    expect(doc.fps).toBe(12);
    expect(doc.onion).toBe(true);
  });

  it('restore: wirft bei ungültigen Zuständen', () => {
    const lay = (cels: [number, Uint32Array][]): Layer => ({ id: 1, name: 'a', visible: true, locked: false, opacity: 100, cels: new Map(cels) });
    const frames = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
    expect(() => PixelDocument.restore(state({ layers: [lay([[9, new Uint32Array(4)]])] }))).toThrow(RangeError);
    expect(() => PixelDocument.restore(state({ layers: [lay([[1, new Uint32Array(3)]])] }))).toThrow(RangeError);
    expect(() => PixelDocument.restore(state({ frames: [] }))).toThrow(RangeError);
    expect(() => PixelDocument.restore(state({ frames: frames(65) }))).toThrow(RangeError);
    expect(() => PixelDocument.restore(state({ frames: [{ id: 1 }, { id: 1 }] }))).toThrow(RangeError);
    expect(() => PixelDocument.restore(state({ currentFrameId: 5 }))).toThrow(RangeError);
    expect(() => PixelDocument.restore(state({ width: 128, height: 128, frames: frames(62), layers: Array.from({ length: 16 }, (_, i) => ({ ...lay([]), id: i + 1 })) }))).toThrow(RangeError);
  });

  it('frameActions', () => {
    const doc = new PixelDocument(2, 2);
    const one = frameActions(doc);
    expect([one.canRemove, one.canMoveLeft, one.canMoveRight]).toEqual([false, false, false]);
    addFrames(doc, 2);
    doc.setCurrentFrame(2);
    const mid = frameActions(doc);
    expect([mid.canRemove, mid.canMoveLeft, mid.canMoveRight]).toEqual([true, true, true]);
  });
});
