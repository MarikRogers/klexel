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

  it('handlesHash erkennt geteilte Links (#i=…), auch unvollständige, sonst nichts', async () => {
    const { createShareLink } = await import('./share/link');
    const link = await createShareLink({ width: 1, height: 1, pixels: Uint32Array.of(0xff0000ff) }, 'https://x.test/app/');
    expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(d.handlesHash!(new URL(link.url).hash)).toBe(true);
    expect(d.handlesHash!('#i=kaputt')).toBe(true); // Klexel meldet dann „beschädigt"
    expect(d.handlesHash!('i=abc')).toBe(true);
    for (const h of ['', '#', '#x=1', '#impressum', '#ix=1']) expect(d.handlesHash!(h)).toBe(false);
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

    it('Modus Ebenen: ein Bild je Ebene aus dem ersten Frame, auch ausgeblendete', () => {
      const { doc } = twoFrames();
      doc.getLayer(2)!.visible = false;
      const r = d.framesOf!(encodeKlexel(doc, [...PICO8], PICO8[0]), 'layers')!;
      expect(r.frames.map(f => [f.frameId, f.name])).toEqual([[1, 'Ebene 1'], [2, 'oben']]);
      expect([...r.frames[0].pixels]).toEqual([0xff0000ff, 0x00ff00ff]);
      expect([...r.frames[1].pixels]).toEqual([0, 0x0000ffff]);
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

describe('klexelDescriptor.fromFrames', () => {
  const px = (w: number, h: number, v: number) => new Uint32Array(w * h).fill(v);

  it('Rundreise über decode: Größe, Frames, Pixel, fps und Namen', () => {
    const frames = [
      { name: '', pixels: px(8, 6, 0xff0000ff) },
      { name: '', pixels: px(8, 6, 0x00ff00ff) },
      { name: 'Eigener', pixels: px(8, 6, 0x0000ffff) },
    ];
    const p = d.fromFrames!({ name: 'walk', width: 8, height: 6, fps: 12, frames });
    expect(d.decode(p)).toBe(p);
    const { doc, palette, color } = decodeKlexel(p)!;
    expect([doc.width, doc.height, doc.fps]).toEqual([8, 6, 12]);
    expect(doc.layers.map(l => l.name)).toEqual(['Ebene 1']);
    expect(doc.frames.map(f => f.name)).toEqual(['walk 1', 'walk 2', 'Eigener']);
    expect(doc.currentFrameId).toBe(doc.frames[0].id);
    doc.frames.forEach((f, i) => expect([...doc.cel(doc.layers[0].id, f.id)!]).toEqual([...frames[i].pixels]));
    expect(palette).toEqual(PICO8);
    expect(color).toBe(PICO8[8]);
  });

  it('fps wird auf 1..30 begrenzt; lange Namen auf 24 Zeichen mit Nummer', () => {
    const one = [{ name: '', pixels: px(2, 2, 1) }];
    expect(decodeKlexel(d.fromFrames!({ name: 'a', width: 2, height: 2, fps: 60, frames: one }))!.doc.fps).toBe(30);
    expect(decodeKlexel(d.fromFrames!({ name: 'a', width: 2, height: 2, fps: 0, frames: one }))!.doc.fps).toBe(1);
    const long = decodeKlexel(d.fromFrames!({ name: 'x'.repeat(40), width: 2, height: 2, fps: 8, frames: one }))!;
    const name = long.doc.frames[0].name!;
    expect(name.length).toBeLessThanOrEqual(24);
    expect(name.endsWith(' 1')).toBe(true);
  });

  it('Pixel werden kopiert, nicht geteilt', () => {
    const pixels = px(2, 2, 0x112233ff);
    const p = d.fromFrames!({ name: 'a', width: 2, height: 2, fps: 8, frames: [{ name: '', pixels }] });
    pixels.fill(0);
    const { doc } = decodeKlexel(p)!;
    expect([...doc.cel(doc.layers[0].id, doc.frames[0].id)!]).toEqual([0x112233ff, 0x112233ff, 0x112233ff, 0x112233ff]);
  });

  it('Grenzen von Klexel: Größe 1..128, Frames 1..64, passende Pixelanzahl → RangeError', () => {
    const f = (w: number, h: number) => ({ name: '', pixels: px(w, h, 0) });
    expect(() => d.fromFrames!({ name: 'a', width: 129, height: 2, fps: 8, frames: [f(129, 2)] })).toThrow(RangeError);
    expect(() => d.fromFrames!({ name: 'a', width: 2, height: 0, fps: 8, frames: [] })).toThrow(RangeError);
    expect(() => d.fromFrames!({ name: 'a', width: 2, height: 2, fps: 8, frames: [] })).toThrow(RangeError);
    expect(() => d.fromFrames!({ name: 'a', width: 2, height: 2, fps: 8, frames: Array.from({ length: 65 }, () => f(2, 2)) })).toThrow(RangeError);
    expect(() => d.fromFrames!({ name: 'a', width: 2, height: 2, fps: 8, frames: [f(3, 2)] })).toThrow(RangeError);
    expect(() => d.fromFrames!({ name: 'a', width: 128, height: 128, fps: 8, frames: Array.from({ length: 64 }, () => f(128, 128)) })).not.toThrow();
  });
});
