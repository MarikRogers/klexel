import { describe, it, expect } from 'vitest';
import { encodeImage, decodeBody, toBase64Url, fromBase64Url } from './linkCodec';

/** Bild aus k Farben (Pixel i hat Farbe i % k); optional ist jedes dritte Pixel transparent. */
function sample(w: number, h: number, k: number, withHoles: boolean): Uint32Array {
  const px = new Uint32Array(w * h);
  for (let i = 0; i < px.length; i++) {
    const c = (i * 7) % k;
    px[i] = withHoles && i % 3 === 0 ? 0 : (((c * 7 + 3) << 24) | ((c * 5 + 20) << 16) | ((255 - c * 3) << 8) | 0xff) >>> 0;
  }
  return px;
}
/** Erwartete Pixel nach dem Rundlauf: transparent = 0, sonst Alpha 255. */
const normal = (px: Uint32Array) => px.map(v => ((v & 255) >= 128 ? ((v & 0xffffff00) | 0xff) >>> 0 : 0));

describe('Base64url', () => {
  it('Rundlauf für mehrere Längen, ohne + / =', () => {
    for (const n of [0, 1, 2, 3, 4, 100, 256]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      const text = toBase64Url(bytes);
      expect(text).not.toMatch(/[+/=]/);
      expect([...fromBase64Url(text)!]).toEqual([...bytes]);
    }
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect([...fromBase64Url(toBase64Url(all))!]).toEqual([...all]);
  });
  it('ungültige Zeichen und unmögliche Länge ergeben null', () => {
    expect(fromBase64Url('a$b')).toBeNull();
    expect(fromBase64Url('A')).toBeNull();
    expect(fromBase64Url('ab=c')).toBeNull();
  });
});

describe('encodeImage', () => {
  it('zwei Farben ohne Transparenz: 1 Bit je Pixel', () => {
    const r = encodeImage(2, 1, Uint32Array.of(0xff0000ff, 0x00ff00ff));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transparent).toBe(false);
    expect([...r.body]).toEqual([2, 1, 2, 255, 0, 0, 0, 255, 0, 0b01000000]);
  });
  it('mit Transparenz: Index 0 ist transparent', () => {
    const r = encodeImage(2, 1, Uint32Array.of(0, 0xff0000ff));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transparent).toBe(true);
    expect([...r.body]).toEqual([2, 1, 1, 255, 0, 0, 0b01000000]);
  });
  it('eine Farbe ohne Transparenz: kein Pixelteil', () => {
    const r = encodeImage(2, 1, Uint32Array.of(0x336699ff, 0x336699ff));
    expect(r.ok && [...r.body]).toEqual([2, 1, 1, 0x33, 0x66, 0x99]);
  });
  it('Alpha 127 ist transparent, Alpha 128 deckend', () => {
    const t = encodeImage(2, 1, Uint32Array.of(0x11223340, 0x11223380));
    expect(t.ok && t.transparent).toBe(true);
    expect(t.ok && [...t.body].slice(3, 6)).toEqual([0x11, 0x22, 0x33]);
  });
  it('Palettenreihenfolge = erstes Auftreten, Duplikate einmal', () => {
    const r = encodeImage(4, 1, Uint32Array.of(0x0000ffff, 0xff0000ff, 0x0000ffff, 0x00ff00ff));
    expect(r.ok && [...r.body].slice(2, 12)).toEqual([3, 0, 0, 255, 255, 0, 0, 0, 255, 0]);
  });
  it('32 Farben erlaubt, 33 nicht', () => {
    expect(encodeImage(8, 8, sample(8, 8, 32, false)).ok).toBe(true);
    expect(encodeImage(8, 8, sample(8, 8, 33, false))).toEqual({ ok: false, problem: { kind: 'too-many-colors', colors: 33 } });
  });
  it('zu groß und leer', () => {
    expect(encodeImage(65, 1, new Uint32Array(65))).toMatchObject({ ok: false, problem: { kind: 'too-large' } });
    expect(encodeImage(1, 65, new Uint32Array(65))).toMatchObject({ ok: false, problem: { kind: 'too-large' } });
    expect(encodeImage(4, 4, new Uint32Array(16))).toMatchObject({ ok: false, problem: { kind: 'empty' } });
    expect(encodeImage(2, 1, Uint32Array.of(0xff000040, 0x0000ff7f))).toMatchObject({ ok: false, problem: { kind: 'empty' } });
  });
  it('deterministisch', () => {
    const px = sample(16, 16, 5, true);
    const a = encodeImage(16, 16, px), b = encodeImage(16, 16, px);
    expect(a.ok && b.ok && [...a.body]).toEqual(b.ok ? [...b.body] : []);
  });
});

describe('Rundlauf encodeImage → decodeBody', () => {
  const cases: Array<[string, number, number, number, boolean]> = [
    ['1×1, eine Farbe', 1, 1, 1, false],
    ['n+t = 2 (zwei Farben)', 8, 8, 2, false],
    ['n+t = 3 (zwei Farben + transparent)', 8, 8, 2, true],
    ['n+t = 5 (vier Farben + transparent)', 9, 7, 4, true],
    ['n+t = 17 (16 Farben + transparent)', 16, 16, 16, true],
    ['n+t = 33 (32 Farben + transparent)', 64, 64, 32, true],
    ['64×64, 32 Farben, ohne transparent', 64, 64, 32, false],
    ['eine Farbe mit Transparenz', 5, 5, 1, true],
  ];
  for (const [name, w, h, k, holes] of cases) {
    it(name, () => {
      const px = sample(w, h, k, holes);
      const e = encodeImage(w, h, px);
      expect(e.ok).toBe(true);
      if (!e.ok) return;
      const d = decodeBody(e.body, e.transparent);
      expect(d.ok).toBe(true);
      if (!d.ok) return;
      expect(d.image.width).toBe(w);
      expect(d.image.height).toBe(h);
      expect([...d.image.pixels]).toEqual([...normal(px)]);
    });
  }
});

describe('decodeBody: Fehler', () => {
  const bad = (body: number[], transparent = false) => decodeBody(Uint8Array.from(body), transparent);
  const good = [2, 1, 2, 255, 0, 0, 0, 255, 0, 0b01000000];
  it('leer, Maße, Farbanzahl', () => {
    expect(decodeBody(new Uint8Array(0), false)).toEqual({ ok: false, error: 'corrupt' });
    expect(bad([0, 1, 1, 0, 0, 0])).toEqual({ ok: false, error: 'corrupt' });
    expect(bad([65, 1, 0])).toEqual({ ok: false, error: 'corrupt' });
    expect(bad([1, 0, 0])).toEqual({ ok: false, error: 'corrupt' });
    expect(bad([1, 1, 33])).toEqual({ ok: false, error: 'corrupt' });
  });
  it('Pixelteil zu kurz oder zu lang, Palette abgeschnitten', () => {
    expect(decodeBody(Uint8Array.from(good), false).ok).toBe(true);
    expect(bad(good.slice(0, -1))).toEqual({ ok: false, error: 'corrupt' });
    expect(bad([...good, 0])).toEqual({ ok: false, error: 'corrupt' });
    expect(bad([2, 1, 2, 255, 0, 0])).toEqual({ ok: false, error: 'corrupt' });
  });
  it('Index außerhalb der Palette, Restbits ungleich 0', () => {
    expect(bad([2, 1, 3, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0b11000000])).toEqual({ ok: false, error: 'corrupt' });
    expect(bad([2, 1, 2, 255, 0, 0, 0, 255, 0, 0b01000001])).toEqual({ ok: false, error: 'corrupt' });
  });
});
