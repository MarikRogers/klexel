import { describe, it, expect } from 'vitest';
import { compositeLayers } from '@suite/shared';
import { PixelDocument } from './Document';

describe('compositeLayers gleich PixelDocument.compositeFrame', () => {
  it('bitgleich bei Deckkraft 50, ausgeblendeter Ebene und halbtransparenten Pixeln', () => {
    const doc = new PixelDocument(4, 2);
    const fid = doc.currentFrameId;
    const l0 = doc.layers[0];
    const [l1, l2, l3] = [doc.createLayer(), doc.createLayer(), doc.createLayer()];
    doc.insertLayer(l1, 1); doc.insertLayer(l2, 2); doc.insertLayer(l3, 3);
    const px = (seed: number) => Uint32Array.from({ length: 8 }, (_, i) => (i + seed) % 3 === 0 ? 0 : (((seed * 7919 + i * 104729) * 2654435761) >>> 0));
    doc.ensureCel(l0.id, fid).set(px(1));
    doc.ensureCel(l1.id, fid).set(px(2));
    doc.ensureCel(l3.id, fid).set(px(3));
    doc.setLayerProps(l1.id, { opacity: 50 });
    doc.setLayerProps(l2.id, { visible: false });
    doc.setLayerProps(l3.id, { opacity: 33 });
    doc.touch();
    const expected = doc.compositeFrame(fid);
    const got = compositeLayers(doc.layers.map(l => ({ visible: l.visible, opacity: l.opacity, cel: l.cels.get(fid) })), 8);
    expect([...got]).toEqual([...expected]);
  });
});
