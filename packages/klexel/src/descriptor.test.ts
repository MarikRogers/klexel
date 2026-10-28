import { describe, it, expect } from 'vitest';
import { klexelDescriptor as d, AREA_MARKER } from './index';
import { decodeKlexel, encodeKlexel } from './storage/projectCodec';
import { PICO8 } from './palette/palettes';
import { MAX_IMAGE_SIZE } from '@suite/shared';
import { MAX_SIZE, PixelDocument } from './model/Document';

describe('klexelDescriptor', () => {
  it('Art, Titel und Marker', () => {
    expect(d.kind).toBe('klexel');
    expect(d.title).toBe('Klexel');
    expect(AREA_MARKER).toBe('AREA_MARKER_KLEXEL');
    expect(d.marker).toBe(AREA_MARKER);
    expect(MAX_SIZE).toBe(MAX_IMAGE_SIZE);
  });

  it('blank: lesbarer Inhalt in der gewünschten Größe mit den Bildpixeln', () => {
    const pixels = new Uint32Array(4 * 3).fill(0x112233ff);
    pixels[0] = 0xff0000ff;
    const p = d.blank({ width: 4, height: 3, image: { width: 4, height: 3, pixels } });
    expect(d.decode(p)).toBe(p);
    const dec = decodeKlexel(p)!;
    expect([dec.doc.width, dec.doc.height]).toEqual([4, 3]);
    expect([...dec.doc.data]).toEqual([...pixels]);
    expect(dec.palette).toEqual(PICO8);
    expect(dec.color).toBe(PICO8[8]);
  });

  it('blank ohne Angaben: 32×32', () => {
    const dec = decodeKlexel(d.blank())!;
    expect([dec.doc.width, dec.doc.height]).toEqual([32, 32]);
  });

  it('blank übernimmt Palette und Farbe des bisherigen Projekts', () => {
    const prev = d.blank({ width: 2, height: 2 });
    prev.palette = [0x010203ff, 0x040506ff];
    prev.color = 0x040506ff;
    const dec = decodeKlexel(d.blank({ width: 8, height: 8 }, prev))!;
    expect(dec.palette).toEqual([0x010203ff, 0x040506ff]);
    expect(dec.color).toBe(0x040506ff);
  });

  it('decode: Unlesbares → null', () => {
    for (const raw of [null, undefined, 42, 'x', {}, { version: 3 }, []]) expect(d.decode(raw)).toBeNull();
  });

  describe('framesOf', () => {
    /** 2×1-Dokument mit zwei Frames (erster benannt) und zwei Ebenen */
    function twoFrames() {
      const doc = new PixelDocument(2, 1);
      const f2 = doc.createFrame();
      doc.insertFrame(f2, 1);
      doc.renameFrame(1, 'upperArm_L');
      const top = doc.createLayer('oben');
      doc.insertLayer(top, 1);
      doc.ensureCel(1, 1).set([0xff0000ff, 0x00ff00ff]);
      doc.ensureCel(top.id, 1).set([0, 0x0000ffff]); // oben deckt nur Pixel 2
      doc.ensureCel(1, f2.id).set([0x123456ff, 0]);
      return { doc, f2 };
    }

    it('liefert je Frame das zusammengerechnete Bild in Originalgröße mit Namen bzw. „Frame <n>"', () => {
      const { doc, f2 } = twoFrames();
      const r = d.framesOf!(encodeKlexel(doc, [...PICO8], PICO8[0]))!;
      expect(r.name).toBe('');
      expect(r.frames.map(f => [f.frameId, f.name, f.width, f.height])).toEqual([
        [1, 'upperArm_L', 2, 1],
        [f2.id, 'Frame 2', 2, 1],
      ]);
      expect([...r.frames[0].pixels]).toEqual([0xff0000ff, 0x0000ffff]);
      expect([...r.frames[0].pixels]).toEqual([...doc.compositeFrame(1)]);
      expect([...r.frames[1].pixels]).toEqual([0x123456ff, 0]);
    });

    it('ausgeblendete Ebenen und Deckkraft wirken wie im Editor', () => {
      const { doc } = twoFrames();
      doc.setLayerProps(doc.layers[1].id, { visible: false });
      const r = d.framesOf!(encodeKlexel(doc, [...PICO8], PICO8[0]))!;
      expect([...r.frames[0].pixels]).toEqual([0xff0000ff, 0x00ff00ff]);
    });

    it('Unlesbares → null', () => {
      for (const raw of [null, 42, 'x', {}, { version: 3, width: 'a' }]) expect(d.framesOf!(raw as never)).toBeNull();
    });
  });

  it('changeKey: gleich bei gleichem Inhalt, verschieden nach einer Pixeländerung', () => {
    const img = (v: number) => ({ width: 2, height: 2, pixels: new Uint32Array(4).fill(v) });
    const a = d.blank({ width: 2, height: 2, image: img(0x000000ff) });
    const b = d.blank({ width: 2, height: 2, image: img(0x000000ff) });
    const c = d.blank({ width: 2, height: 2, image: img(0x000001ff) });
    expect(d.changeKey(a)).toBe(d.changeKey(b));
    expect(d.changeKey(a)).not.toBe(d.changeKey(c));
  });
});
