import { describe, it, expect } from 'vitest';
import { PixelDocument, MAX_LAYERS } from './Document';
import { History } from './History';

function setup(w = 4, h = 4) {
  const doc = new PixelDocument(w, h);
  return { doc, h: new History(doc) };
}

function stroke(h: History, x: number, y: number, c: number) {
  h.begin();
  h.set(x, y, c);
  h.commit();
}

describe('History: Ebenen', () => {
  it('addLayer: Undo entfernt und stellt activeId wieder her, Redo gleiche id', () => {
    const { doc, h } = setup();
    const l = h.addLayer()!;
    expect(doc.layers.length).toBe(2);
    expect(doc.activeId).toBe(l.id);
    h.undo();
    expect(doc.layers.length).toBe(1);
    expect(doc.activeId).toBe(1);
    h.redo();
    expect(doc.layers.map((x) => x.id)).toEqual([1, l.id]);
    expect(doc.activeId).toBe(l.id);
  });

  it('removeLayer: Undo bringt gleiche id und Pixel zurück; neue Ebene bekommt neue id', () => {
    const { doc, h } = setup();
    const l = h.addLayer()!;
    stroke(h, 1, 1, 0xff0000ff);
    expect(h.removeLayer()).toBe(true);
    expect(doc.layers.length).toBe(1);
    expect(doc.activeId).toBe(1);
    h.undo();
    expect(doc.activeId).toBe(l.id);
    expect(doc.ensureCel(l.id, 1)[5]).toBe(0xff0000ff);
    h.redo();
    const n = h.addLayer()!;
    expect(n.id).not.toBe(l.id);
    expect(n.id).toBeGreaterThan(l.id);
  });

  it('Grenzen: 16 Ebenen und Ränder', () => {
    const { doc, h } = setup();
    while (doc.layers.length < MAX_LAYERS) h.addLayer();
    let steps = 0;
    while (h.undo()) steps++;
    expect(steps).toBe(MAX_LAYERS - 1);
    while (h.redo()) { /* zurück */ }
    expect(h.addLayer()).toBeNull();
    expect(h.duplicateLayer()).toBeNull();
    expect(doc.layers.length).toBe(MAX_LAYERS);
    steps = 0;
    while (h.undo()) steps++;
    expect(steps).toBe(MAX_LAYERS - 1);

    const s = setup();
    s.h.addLayer();
    s.h.undo();
    s.h.redo();
    s.h.undo();
    s.h.addLayer();
    s.h.undo();
    expect(s.h.canUndo).toBe(false);
    s.h.addLayer();
    expect(s.h.moveActive(1)).toBe(false);
    s.doc.setActive(1);
    expect(s.h.moveActive(-1)).toBe(false);
    s.h.undo();
    expect(s.h.canUndo).toBe(false);
  });

  it('removeLayer der letzten Ebene und der untersten von drei', () => {
    const { doc, h } = setup();
    expect(h.removeLayer()).toBe(false);
    expect(h.canUndo).toBe(false);
    h.addLayer();
    const top = h.addLayer()!;
    doc.setActive(1);
    expect(h.removeLayer()).toBe(true);
    expect(doc.activeId).toBe(top.id);
  });

  it('moveActive und duplicateLayer: Undo/Redo', () => {
    const { doc, h } = setup();
    const b = h.addLayer()!;
    stroke(h, 0, 0, 0x11223344);
    doc.setActive(1);
    expect(h.moveActive(1)).toBe(true);
    expect(doc.layers.map((x) => x.id)).toEqual([b.id, 1]);
    h.undo();
    expect(doc.layers.map((x) => x.id)).toEqual([1, b.id]);
    h.redo();
    expect(doc.layers.map((x) => x.id)).toEqual([b.id, 1]);

    doc.setActive(b.id);
    const d = h.duplicateLayer()!;
    expect(doc.layers.length).toBe(3);
    expect(d.name.endsWith(' Kopie')).toBe(true);
    expect(d.name.length).toBeLessThanOrEqual(24);
    expect(doc.ensureCel(d.id, 1)[0]).toBe(0x11223344);
    expect(doc.activeId).toBe(d.id);
    h.undo();
    expect(doc.layers.length).toBe(2);
    h.redo();
    expect(doc.layers.length).toBe(3);
  });

  it('mergeDown', () => {
    const { doc, h } = setup();
    doc.ensureCel(doc.layers[0].id, 1)[0] = 0xff0000ff;
    const up = h.addLayer()!;
    doc.ensureCel(up.id, 1)[0] = 0x0000ffff;
    doc.setLayerProps(up.id, { opacity: 50 });
    expect(h.mergeDown()).toBe(true);
    expect(doc.layers.length).toBe(1);
    expect(doc.activeId).toBe(1);
    expect(doc.ensureCel(doc.layers[0].id, 1)[0]).toBe(0x800080ff);
    h.undo();
    expect(doc.layers.length).toBe(2);
    expect(doc.ensureCel(doc.layers[0].id, 1)[0]).toBe(0xff0000ff);
    expect(doc.ensureCel(up.id, 1)[0]).toBe(0x0000ffff);
    expect(doc.activeId).toBe(up.id);
    h.redo();
    expect(doc.ensureCel(doc.layers[0].id, 1)[0]).toBe(0x800080ff);
    h.undo();
    doc.layers[0].locked = true;
    expect(h.mergeDown()).toBe(false);
    doc.layers[0].locked = false;
    doc.getLayer(up.id)!.visible = false;
    expect(h.mergeDown()).toBe(false);
  });

  it('mergeDown: halbtransparent über transparent behält Farbe, Alpha ca. 128', () => {
    const { doc, h } = setup();
    const up = h.addLayer()!;
    doc.ensureCel(up.id, 1)[0] = 0x00ff0080;
    expect(h.mergeDown()).toBe(true);
    const v = doc.ensureCel(doc.layers[0].id, 1)[0];
    expect(v >>> 8).toBe(0x00ff00);
    expect(Math.abs((v & 255) - 128)).toBeLessThanOrEqual(1);
  });

  it('mergeDown: Deckkraft der unteren Ebene bleibt Eigenschaft, wird nicht eingebacken', () => {
    const { doc, h } = setup();
    doc.ensureCel(doc.layers[0].id, 1)[0] = 0xff0000ff;
    doc.setLayerProps(1, { opacity: 60 });
    const up = h.addLayer()!;
    doc.ensureCel(up.id, 1)[0] = 0x0000ffff;
    doc.ensureCel(up.id, 1)[1] = 0x00ff00ff;
    expect(h.mergeDown()).toBe(true);
    expect(doc.layers[0].opacity).toBe(60);
    expect(doc.ensureCel(doc.layers[0].id, 1)[0]).toBe(0x0000ffff);
    expect(doc.ensureCel(doc.layers[0].id, 1)[1]).toBe(0x00ff00ff);
  });

  it('pixels mit Ebenenwechsel', () => {
    const { doc, h } = setup();
    const b = h.addLayer()!;
    doc.setActive(1);
    stroke(h, 0, 0, 0xaa);
    doc.setActive(b.id);
    stroke(h, 1, 0, 0xbb);
    h.undo();
    expect(doc.ensureCel(b.id, 1)[1]).toBe(0);
    expect(doc.ensureCel(1, 1)[0]).toBe(0xaa);
    h.undo();
    expect(doc.ensureCel(1, 1)[0]).toBe(0);
  });

  it('previewProps / commitProps', () => {
    const { doc, h } = setup();
    for (const o of [90, 80, 70, 60, 50]) h.previewProps(1, { opacity: o });
    expect(h.commitProps()).toBe(true);
    expect(doc.layers[0].opacity).toBe(50);
    h.undo();
    expect(doc.layers[0].opacity).toBe(100);
    expect(h.canUndo).toBe(false);

    h.previewProps(1, { opacity: 40 });
    h.previewProps(1, { opacity: 100 });
    expect(h.commitProps()).toBe(false);
    expect(h.canUndo).toBe(false);
  });

  it('setProps', () => {
    const { doc, h } = setup();
    expect(h.setProps(1, { opacity: 100 })).toBe(false);
    expect(h.canUndo).toBe(false);
    expect(h.setProps(1, { visible: false })).toBe(true);
    h.undo();
    expect(doc.layers[0].visible).toBe(true);
    h.redo();
    expect(doc.layers[0].visible).toBe(false);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.setProps(1, { locked: true });
    expect(h.canRedo).toBe(false);
  });

  it('Limit 100', () => {
    const { doc, h } = setup();
    for (let i = 0; i < 101; i++) h.setProps(1, { opacity: i % 2 ? 100 : 50 });
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(100);
    expect(doc.layers[0].opacity).toBe(50);
  });
});

describe('History: Strich fixiert die Ebene', () => {
  it('schreibt nach Ebenenwechsel weiter in die Ebene vom begin()', () => {
    const { doc, h } = setup();
    const a = doc.activeId;
    const b = h.addLayer()!.id;
    doc.setActive(a);
    h.begin();
    h.set(1, 1, 7);
    doc.setActive(b);
    expect(h.set(2, 2, 9)).toBe(true);
    h.commit();
    expect(doc.cel(a, doc.currentFrameId)![1 * 4 + 1]).toBe(7);
    expect(doc.cel(a, doc.currentFrameId)![2 * 4 + 2]).toBe(9);
    expect(doc.cel(b, doc.currentFrameId)).toBeUndefined();
    h.undo();
    expect(doc.cel(a, doc.currentFrameId)![1 * 4 + 1]).toBe(0);
    expect(doc.cel(a, doc.currentFrameId)![2 * 4 + 2]).toBe(0);
    expect(doc.cel(b, doc.currentFrameId)).toBeUndefined();
  });
});

describe('History: offener Strich', () => {
  it('undo/redo tun bei offenem Strich nichts und liefern false', () => {
    const { doc, h } = setup();
    stroke(h, 0, 0, 5);
    h.undo();
    h.begin();
    h.set(1, 1, 7);
    expect(h.undo()).toBe(false);
    expect(h.redo()).toBe(false);
    expect(h.canRedo).toBe(true);
    expect(h.strokeOpen).toBe(true);
    h.cancel();
    expect(doc.cel(doc.activeId, doc.currentFrameId)![1 * 4 + 1]).toBe(0);
    expect(h.redo()).toBe(true);
    expect(doc.cel(doc.activeId, doc.currentFrameId)![0]).toBe(5);
  });
  it('normales undo/redo bleibt unveraendert', () => {
    const { doc, h } = setup();
    stroke(h, 0, 0, 5);
    expect(h.undo()).toBe(true);
    expect(doc.cel(doc.activeId, doc.currentFrameId)![0]).toBe(0);
    expect(h.redo()).toBe(true);
    expect(doc.cel(doc.activeId, doc.currentFrameId)![0]).toBe(5);
  });
});

describe('History: unset und dropLast', () => {
  const px = (doc: PixelDocument, x: number, y: number) => doc.cel(doc.activeId, doc.currentFrameId)?.[y * doc.width + x] ?? 0;

  it('unset restores the value from before the stroke', () => {
    const { doc, h } = setup();
    stroke(h, 1, 1, 5);
    h.begin(); h.set(1, 1, 9);
    expect(h.unset(1, 1)).toBe(true);
    expect(px(doc, 1, 1)).toBe(5);
  });

  it('unset after two writes returns to the original', () => {
    const { doc, h } = setup();
    h.begin(); h.set(2, 2, 7); h.set(2, 2, 8);
    expect(h.unset(2, 2)).toBe(true);
    expect(px(doc, 2, 2)).toBe(0);
  });

  it('unset without a recorded change returns false', () => {
    const { h } = setup();
    expect(h.unset(0, 0)).toBe(false); // kein Strich offen
    h.begin();
    expect(h.unset(0, 0)).toBe(false); // nichts aufgezeichnet
  });

  it('commit after unset of the only change adds no undo step', () => {
    const { h } = setup();
    h.begin(); h.set(1, 1, 3); h.unset(1, 1); h.commit();
    expect(h.canUndo).toBe(false);
  });

  it('dropLast reverts and does not fill the redo stack', () => {
    const { doc, h } = setup();
    stroke(h, 3, 3, 4);
    expect(h.dropLast()).toBe(true);
    expect(px(doc, 3, 3)).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('dropLast with an open stroke or empty stack returns false', () => {
    const { h } = setup();
    expect(h.dropLast()).toBe(false);
    stroke(h, 0, 0, 1);
    h.begin();
    expect(h.dropLast()).toBe(false);
  });
});

describe('History: commit meldet, ob ein Schritt entstand', () => {
  it('commit returns true with changes and false without', () => {
    const { h } = setup();
    h.begin(); h.set(0, 0, 3);
    expect(h.commit()).toBe(true);
    h.begin(); h.set(0, 0, 3); // gleicher Wert: keine Änderung
    expect(h.commit()).toBe(false);
  });
});
