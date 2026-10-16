import { describe, it, expect } from 'vitest';
import { PixelDocument, MAX_LAYERS, layerActions } from './Document';

function fill16(doc: PixelDocument): void {
  while (doc.layers.length < MAX_LAYERS) doc.insertLayer(doc.createLayer(), doc.layers.length);
}

describe('Ebenen-Modell', () => {
  it('neues Dokument hat eine aktive Ebene "Ebene 1"', () => {
    const doc = new PixelDocument(4, 4);
    expect(doc.layers.length).toBe(1);
    expect(doc.activeLayer.name).toBe('Ebene 1');
    expect(doc.activeId).toBe(1);
  });

  it('IDs werden nie wiederverwendet', () => {
    const doc = new PixelDocument(4, 4);
    const a = doc.createLayer();
    expect(a.name).toBe('Ebene 2');
    doc.insertLayer(a, 1);
    doc.removeLayer(a.id);
    const b = doc.createLayer();
    expect(b.id).toBe(3);
    expect(b.name).toBe('Ebene 3');
  });

  it('Grenzen', () => {
    const doc = new PixelDocument(2, 2);
    fill16(doc);
    expect(() => doc.insertLayer(doc.createLayer(), 0)).toThrow();
    const single = new PixelDocument(2, 2);
    expect(() => single.removeLayer(1)).toThrow();
    const mk = (id: number, len = 4) => ({ id, name: `E${id}`, visible: true, locked: false, opacity: 100, data: new Uint32Array(len) });
    expect(() => PixelDocument.fromLayers(2, 2, [mk(1, 3)], 1, 2)).toThrow(RangeError);
    expect(() => PixelDocument.fromLayers(2, 2, [], 1, 2)).toThrow(RangeError);
    const many = Array.from({ length: 17 }, (_, i) => mk(i + 1));
    expect(() => PixelDocument.fromLayers(2, 2, many, 1, 18)).toThrow(RangeError);
    expect(() => PixelDocument.fromLayers(2, 2, [mk(1)], 9, 2)).toThrow(RangeError);
  });

  it('setLayerProps', () => {
    const doc = new PixelDocument(2, 2);
    const id = doc.activeId;
    doc.setLayerProps(id, { opacity: 150 });
    expect(doc.activeLayer.opacity).toBe(100);
    doc.setLayerProps(id, { opacity: -3 });
    expect(doc.activeLayer.opacity).toBe(0);
    doc.setLayerProps(id, { opacity: 49.6 });
    expect(doc.activeLayer.opacity).toBe(50);
    doc.setLayerProps(id, { name: '  ' });
    expect(doc.activeLayer.name).toBe('Ebene 1');
    doc.setLayerProps(id, { name: 'x'.repeat(30) });
    expect(doc.activeLayer.name).toBe('x'.repeat(24));
  });

  it('get/set/data wirken auf die aktive Ebene', () => {
    const doc = new PixelDocument(3, 3);
    const l2 = doc.createLayer();
    doc.insertLayer(l2, 1);
    doc.setActive(l2.id);
    expect(doc.set(1, 1, 5)).toBe(true);
    expect(l2.data[4]).toBe(5);
    expect(doc.layers[0].data[4]).toBe(0);
    expect(doc.get(1, 1)).toBe(5);
    expect(doc.data).toBe(l2.data);
  });

  it('drawBlockReason', () => {
    const doc = new PixelDocument(2, 2);
    expect(doc.drawBlockReason()).toBeNull();
    doc.setLayerProps(1, { visible: false });
    expect(doc.drawBlockReason()).toBe('hidden');
    doc.setLayerProps(1, { locked: true });
    expect(doc.drawBlockReason()).toBe('locked');
  });
});

describe('layerActions', () => {
  it('eine Ebene', () => {
    const a = layerActions(new PixelDocument(2, 2));
    expect(a.canRemove).toBe(false);
    expect(a.canMoveUp).toBe(false);
    expect(a.canMoveDown).toBe(false);
    expect(a.canMergeDown).toBe(false);
    expect(a.canAdd).toBe(true);
  });

  it('16 Ebenen', () => {
    const doc = new PixelDocument(2, 2);
    fill16(doc);
    const a = layerActions(doc);
    expect(a.canAdd).toBe(false);
    expect(a.canDuplicate).toBe(false);
  });

  it('canMergeDown', () => {
    const doc = new PixelDocument(2, 2);
    const top = doc.createLayer();
    doc.insertLayer(top, 1);
    doc.setActive(top.id);
    expect(layerActions(doc).canMergeDown).toBe(true);
    doc.setLayerProps(1, { locked: true });
    expect(layerActions(doc).canMergeDown).toBe(false);
    doc.setLayerProps(1, { locked: false });
    doc.setLayerProps(top.id, { visible: false });
    expect(layerActions(doc).canMergeDown).toBe(false);
  });
});

describe('Compositing', () => {
  function two(): PixelDocument {
    const doc = new PixelDocument(2, 1);
    doc.layers[0].data[0] = 0xff0000ff;
    const top = doc.createLayer();
    doc.insertLayer(top, 1);
    top.data[0] = 0x0000ffff;
    return doc;
  }

  it('Deckkraft 50% blau über rot', () => {
    const doc = two();
    doc.setLayerProps(doc.layers[1].id, { opacity: 50 });
    doc.touch();
    expect(doc.getComposite(0, 0)).toBe(0x800080ff);
  });

  it('transparente obere Ebene zeigt untere', () => {
    const doc = two();
    doc.layers[1].data[0] = 0;
    doc.touch();
    expect(doc.getComposite(0, 0)).toBe(0xff0000ff);
  });

  it('ausgeblendete Ebene wird übersprungen', () => {
    const doc = two();
    doc.setLayerProps(doc.layers[1].id, { visible: false });
    expect(doc.getComposite(0, 0)).toBe(0xff0000ff);
  });

  it('alles transparent ergibt 0', () => {
    expect(new PixelDocument(2, 2).getComposite(1, 1)).toBe(0);
    expect(new PixelDocument(2, 2).getComposite(-1, 0)).toBe(0);
  });

  it('halbtransparentes Pixel bleibt erhalten', () => {
    const doc = new PixelDocument(2, 1);
    doc.layers[0].data[0] = 0x00ff0080;
    doc.touch();
    expect(doc.getComposite(0, 0)).toBe(0x00ff0080);
  });

  it('Cache wird durch set und touch invalidiert', () => {
    const doc = new PixelDocument(2, 1);
    expect(doc.composite()[0]).toBe(0);
    doc.set(0, 0, 0x112233ff);
    expect(doc.composite()[0]).toBe(0x112233ff);
    doc.layers[0].data[1] = 0x445566ff;
    doc.touch();
    expect(doc.composite()[1]).toBe(0x445566ff);
  });
});
