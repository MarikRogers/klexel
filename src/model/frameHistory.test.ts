import { describe, it, expect } from 'vitest';
import { PixelDocument, MAX_FRAMES, MAX_LAYERS } from './Document';
import { History } from './History';

function setup(w = 4, h = 4) {
  const doc = new PixelDocument(w, h);
  return { doc, h: new History(doc) };
}

function stroke(h: History, x: number, y: number, c: number): void {
  h.begin();
  h.set(x, y, c);
  h.commit();
}

const ids = (doc: PixelDocument) => doc.frames.map((f) => f.id);

describe('addFrame', () => {
  it('fügt direkt nach dem aktuellen ein und macht ihn aktuell; Undo/Redo mit gleicher id', () => {
    const { doc, h } = setup();
    h.addFrame();
    doc.setCurrentFrame(1);
    const f = h.addFrame()!;
    expect(ids(doc)).toEqual([1, 3, 2]);
    expect(doc.currentFrameId).toBe(f.id);
    h.undo();
    expect(ids(doc)).toEqual([1, 2]);
    expect(doc.currentFrameId).toBe(1);
    h.redo();
    expect(ids(doc)).toEqual([1, 3, 2]);
    expect(doc.frames[1]).toBe(f);
    expect(doc.currentFrameId).toBe(3);
  });
});

describe('duplicateFrame', () => {
  it('kopiert Pixel aller Ebenen unabhängig; Undo/Redo', () => {
    const { doc, h } = setup();
    stroke(h, 0, 0, 0xff0000ff);
    h.addLayer();
    stroke(h, 1, 1, 0x00ff00ff);
    const f = h.duplicateFrame()!;
    expect(ids(doc)).toEqual([1, f.id]);
    expect(doc.currentFrameId).toBe(f.id);
    expect(doc.cel(1, f.id)![0]).toBe(0xff0000ff);
    expect(doc.cel(2, f.id)![5]).toBe(0x00ff00ff);
    stroke(h, 0, 0, 0x0000ffff);
    expect(doc.cel(1, 1)![0]).toBe(0xff0000ff);
    h.undo();
    h.undo();
    expect(ids(doc)).toEqual([1]);
    expect(doc.currentFrameId).toBe(1);
    h.redo();
    expect(ids(doc)).toEqual([1, f.id]);
    expect(doc.cel(2, f.id)![5]).toBe(0x00ff00ff);
  });
});

describe('removeFrame', () => {
  it('Undo bringt Frame mit gleicher id und Cels zurück, fehlende Cel bleibt fehlend', () => {
    const { doc, h } = setup();
    const a = doc.activeId;
    h.addLayer();
    const b = doc.activeId;
    doc.setActive(a);
    h.addFrame();
    stroke(h, 2, 2, 0xff0000ff);
    expect(doc.cel(b, 2)).toBeUndefined();
    expect(h.removeFrame()).toBe(true);
    expect(ids(doc)).toEqual([1]);
    expect(doc.currentFrameId).toBe(1);
    h.undo();
    expect(ids(doc)).toEqual([1, 2]);
    expect(doc.currentFrameId).toBe(2);
    expect(doc.cel(a, 2)![10]).toBe(0xff0000ff);
    expect(doc.cel(b, 2)).toBeUndefined();
    h.redo();
    expect(ids(doc)).toEqual([1]);
    h.undo();
    h.undo();
    h.undo();
    expect(h.addFrame()!.id).toBe(3);
  });

  it('letzter Frame: false ohne Schritt; erster Frame gelöscht -> neuer erster aktuell', () => {
    const { doc, h } = setup();
    expect(h.removeFrame()).toBe(false);
    expect(h.canUndo).toBe(false);
    h.addFrame();
    doc.setCurrentFrame(1);
    h.removeFrame();
    expect(ids(doc)).toEqual([2]);
    expect(doc.currentFrameId).toBe(2);
  });

  it('mittlerer Frame gelöscht -> vorheriger aktuell', () => {
    const { doc, h } = setup();
    h.addFrame();
    h.addFrame();
    h.removeFrame();
    expect(ids(doc)).toEqual([1, 2]);
    expect(doc.currentFrameId).toBe(2);
  });
});

describe('moveFrame', () => {
  it('Undo/Redo stellen Reihenfolge her; am Rand false ohne Schritt', () => {
    const { doc, h } = setup();
    h.addFrame();
    h.addFrame();
    expect(h.moveFrame(1)).toBe(false);
    doc.setCurrentFrame(1);
    expect(h.moveFrame(-1)).toBe(false);
    expect(h.moveFrame(1)).toBe(true);
    expect(ids(doc)).toEqual([2, 1, 3]);
    h.undo();
    expect(ids(doc)).toEqual([1, 2, 3]);
    h.redo();
    expect(ids(doc)).toEqual([2, 1, 3]);
    h.undo();
    h.undo();
    h.undo();
    expect(h.canUndo).toBe(false);
  });
});

describe('pixels über mehrere Frames', () => {
  it('Undo springt zum Frame des Schritts', () => {
    const { doc, h } = setup();
    stroke(h, 0, 0, 0xff0000ff);
    h.addFrame();
    stroke(h, 1, 0, 0x00ff00ff);
    doc.setCurrentFrame(1);
    h.undo();
    expect(doc.currentFrameId).toBe(2);
    expect(doc.cel(1, 2)![1]).toBe(0);
    expect(doc.cel(1, 1)![0]).toBe(0xff0000ff);
    h.undo(); // addFrame
    h.undo(); // Strich in Frame 1
    expect(doc.currentFrameId).toBe(1);
    h.redo();
    h.redo();
    doc.setCurrentFrame(1);
    h.redo();
    expect(doc.currentFrameId).toBe(2);
    expect(doc.cel(1, 2)![1]).toBe(0x00ff00ff);
  });

  it('cancel stellt Pixel des begin()-Frames auch nach setCurrentFrame wieder her', () => {
    const { doc, h } = setup();
    h.addFrame();
    h.begin();
    h.set(0, 0, 0xff0000ff);
    doc.setCurrentFrame(1);
    h.cancel();
    expect(doc.cel(1, 2)![0]).toBe(0);
    expect(doc.cel(1, 1)).toBeUndefined();
  });
});

describe('Ebenen über alle Frames', () => {
  it('Ebene löschen: Undo bringt Cels beider Frames zurück', () => {
    const { doc, h } = setup();
    h.addLayer();
    const id = doc.activeId;
    stroke(h, 0, 0, 0xff0000ff);
    h.addFrame();
    stroke(h, 1, 1, 0x00ff00ff);
    h.removeLayer();
    h.undo();
    expect(doc.cel(id, 1)![0]).toBe(0xff0000ff);
    expect(doc.cel(id, 2)![5]).toBe(0x00ff00ff);
  });

  it('duplicateLayer kopiert Cels aller Frames unabhängig', () => {
    const { doc, h } = setup();
    stroke(h, 0, 0, 0xff0000ff);
    h.addFrame();
    stroke(h, 1, 1, 0x00ff00ff);
    const copy = h.duplicateLayer()!;
    expect(copy.cels.get(1)![0]).toBe(0xff0000ff);
    expect(copy.cels.get(2)![5]).toBe(0x00ff00ff);
    copy.cels.get(1)![0] = 7;
    expect(doc.cel(1, 1)![0]).toBe(0xff0000ff);
  });

  it('mergeDown verschmilzt in beiden Frames; Undo/Redo', () => {
    const { doc, h } = setup();
    const lower = doc.activeId;
    h.addLayer();
    const upper = doc.activeId;
    stroke(h, 0, 0, 0xff0000ff); // Frame 1, nur obere
    h.addFrame();
    doc.setActive(lower);
    stroke(h, 1, 1, 0x00ff00ff); // Frame 2, nur untere
    doc.setActive(upper);
    expect(h.mergeDown()).toBe(true);
    expect(doc.cel(lower, 1)![0]).toBe(0xff0000ff);
    expect(doc.cel(lower, 2)![5]).toBe(0x00ff00ff);
    h.undo();
    expect(doc.cel(lower, 1)).toBeUndefined();
    expect(doc.cel(lower, 2)![5]).toBe(0x00ff00ff);
    expect(doc.cel(upper, 1)![0]).toBe(0xff0000ff);
    h.redo();
    expect(doc.cel(lower, 1)![0]).toBe(0xff0000ff);
    expect(doc.getLayer(upper)).toBeUndefined();
  });
});

describe('Grenzen', () => {
  it('65. Frame: addFrame und duplicateFrame -> null ohne Schritt', () => {
    const { doc, h } = setup(2, 2);
    for (let i = 1; i < MAX_FRAMES; i++) doc.insertFrame(doc.createFrame(), doc.frames.length);
    expect(h.addFrame()).toBeNull();
    expect(h.duplicateFrame()).toBeNull();
    expect(h.canUndo).toBe(false);
  });

  it('Budget erreicht: addFrame -> null', () => {
    const { doc, h } = setup(128, 128);
    for (let i = 1; i < MAX_LAYERS; i++) doc.insertLayer(doc.createLayer(), doc.layers.length);
    for (let i = 1; i < 61; i++) doc.insertFrame(doc.createFrame(), doc.frames.length);
    expect(doc.fitsBudget(0, 1)).toBe(false);
    expect(h.addFrame()).toBeNull();
    expect(h.duplicateFrame()).toBeNull();
    expect(h.canUndo).toBe(false);
  });

  it('Limit 100 gilt gemeinsam für alle Schrittarten', () => {
    const { doc, h } = setup(2, 2);
    for (let i = 0; i < 101; i++) {
      if (i % 3 === 0) h.addFrame();
      else if (i % 3 === 1) stroke(h, i % 2, 0, 0x01020304 + i);
      else h.moveFrame(-1) || h.moveFrame(1);
    }
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(100);
    expect(doc.frames.length).toBeGreaterThan(1);
  });
});
