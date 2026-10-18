import { describe, it, expect, vi, afterEach } from 'vitest';
import { createShareLink, readShareLink, LINK_OK_MAX, LINK_WARN_MAX } from './link';
import { fromBase64Url, toBase64Url, type DecodedImage } from './linkCodec';

const BASE = 'https://example.test/klexel/';
const RED = 0xff0000ff, GREEN = 0x00ff00ff;

function img(w: number, h: number, f: (i: number) => number): DecodedImage {
  const pixels = new Uint32Array(w * h);
  for (let i = 0; i < pixels.length; i++) pixels[i] = f(i) >>> 0;
  return { width: w, height: h, pixels };
}
/** Pseudozufällig, aber fest (LCG), damit sich die Daten kaum komprimieren lassen. */
function noisy(w: number, h: number, colors: number, holes: boolean): DecodedImage {
  let s = 12345;
  return img(w, h, () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const r = (s >>> 8) % (colors + (holes ? 1 : 0));
    if (holes && r === colors) return 0;
    return ((r * 7 + 3) << 24) | ((r * 5 + 20) << 16) | ((255 - r * 3) << 8) | 0xff;
  });
}
const valueOf = (url: string) => new URL(url).hash.slice(3);
const mutate = (url: string, f: (b: Uint8Array) => Uint8Array) => '#i=' + toBase64Url(f(fromBase64Url(valueOf(url))!));

afterEach(() => vi.unstubAllGlobals());

describe('createShareLink', () => {
  it('Rundlauf eines 16×16-Bildes mit zwei Farben und Transparenz', async () => {
    const image = img(16, 16, i => (i % 5 === 0 ? 0 : i % 2 ? RED : GREEN));
    const r = await createShareLink(image, BASE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url.startsWith(BASE + '#i=')).toBe(true);
    expect(r.length).toBe(r.url.length);
    const back = await readShareLink(new URL(r.url).hash);
    expect(back).not.toBeNull();
    expect(back && back.ok).toBe(true);
    if (!back || !back.ok) return;
    expect(back.image.width).toBe(16);
    expect(back.colors).toBe(2);
    expect([...back.image.pixels]).toEqual([...image.pixels]);
  });

  it('gleiche Eingabe ergibt denselben Link', async () => {
    const image = noisy(16, 16, 5, true);
    const a = await createShareLink(image, BASE), b = await createShareLink(image, BASE);
    expect(a.ok && b.ok && a.url).toBe(b.ok ? b.url : '');
  });

  it('Kompression nur, wenn sie kürzer macht', async () => {
    const flat = await createShareLink(img(64, 64, i => (i === 0 ? GREEN : RED)), BASE);
    expect(flat.ok && (fromBase64Url(valueOf(flat.url))![1] & 2)).toBe(2);
    const tiny = await createShareLink(img(2, 1, i => (i ? GREEN : RED)), BASE);
    expect(tiny.ok && (fromBase64Url(valueOf(tiny.url))![1] & 2)).toBe(0);
  });

  it('Längenstufen: ok, warn, zu lang', async () => {
    const small = await createShareLink(noisy(16, 16, 8, false), BASE);
    expect(small).toMatchObject({ ok: true, level: 'ok' });
    expect(small.ok && small.length).toBeLessThanOrEqual(LINK_OK_MAX);
    const mid = await createShareLink(noisy(64, 64, 32, false), BASE);
    expect(mid).toMatchObject({ ok: true, level: 'warn' });
    expect(mid.ok && mid.length).toBeGreaterThan(LINK_OK_MAX);
    expect(mid.ok && mid.length).toBeLessThanOrEqual(LINK_WARN_MAX);
    const big = await createShareLink(noisy(64, 64, 32, true), BASE);
    expect(big).toMatchObject({ ok: false, reason: 'too-long' });
    expect(!big.ok && big.length).toBeGreaterThan(LINK_WARN_MAX);
  });

  it('Gründe: leer, zu groß, zu viele Farben', async () => {
    expect(await createShareLink(img(4, 4, () => 0), BASE)).toMatchObject({ ok: false, reason: 'empty' });
    expect(await createShareLink(img(65, 64, () => RED), BASE)).toMatchObject({ ok: false, reason: 'too-large' });
    const many = img(8, 8, i => { const c = i % 33; return ((c * 7 + 3) << 24) | ((c * 5 + 20) << 16) | ((255 - c * 3) << 8) | 0xff; });
    expect(await createShareLink(many, BASE)).toMatchObject({ ok: false, reason: 'too-many-colors', colors: 33 });
  });

  it('ein vorhandenes # in der Basis wird abgeschnitten', async () => {
    const r = await createShareLink(img(2, 1, () => RED), BASE + '#alt');
    expect(r.ok && r.url.startsWith(BASE + '#i=')).toBe(true);
  });
});

describe('readShareLink', () => {
  const good = async () => {
    const r = await createShareLink(img(8, 8, i => (i % 2 ? RED : GREEN)), BASE);
    if (!r.ok) throw new Error('Testlink');
    return r.url;
  };

  it('fremder oder leerer Hash: null', async () => {
    expect(await readShareLink('')).toBeNull();
    expect(await readShareLink('#')).toBeNull();
    expect(await readShareLink('#foo')).toBeNull();
    expect(await readShareLink('#x=1')).toBeNull();
  });

  it('ohne führendes # wird ebenfalls gelesen', async () => {
    const url = await good();
    const r = await readShareLink(new URL(url).hash.slice(1));
    expect(r && r.ok).toBe(true);
  });

  it('beschädigt: ungültige Zeichen, leer, abgeschnitten, unbekanntes Flag', async () => {
    const url = await good();
    expect(await readShareLink('#i=%%%')).toEqual({ ok: false, error: 'corrupt' });
    expect(await readShareLink('#i=')).toEqual({ ok: false, error: 'corrupt' });
    expect(await readShareLink(new URL(url).hash.slice(0, -1))).toEqual({ ok: false, error: 'corrupt' });
    expect(await readShareLink(mutate(url, b => { const c = b.slice(); c[1] |= 4; return c; }))).toEqual({ ok: false, error: 'corrupt' });
    expect(await readShareLink(mutate(url, b => { const c = b.slice(); c[0] = 0; return c; }))).toEqual({ ok: false, error: 'corrupt' });
  });

  it('neuere Version: newer', async () => {
    const url = await good();
    expect(await readShareLink(mutate(url, b => { const c = b.slice(); c[0] = 2; return c; }))).toEqual({ ok: false, error: 'newer' });
  });

  it('Rest-Parameter werden ignoriert', async () => {
    const url = await good();
    const r = await readShareLink(new URL(url).hash + '&x=1');
    expect(r && r.ok).toBe(true);
  });

  it('komprimierter Link ohne DecompressionStream: no-decompress; unkomprimierter geht trotzdem', async () => {
    const flat = await createShareLink(img(64, 64, i => (i === 0 ? GREEN : RED)), BASE);
    if (!flat.ok) throw new Error('Testlink');
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await readShareLink(new URL(flat.url).hash)).toEqual({ ok: false, error: 'no-decompress' });
    const tiny = await createShareLink(img(2, 1, i => (i ? GREEN : RED)), BASE); // zu klein für Kompression
    if (!tiny.ok) throw new Error('Testlink');
    const r = await readShareLink(new URL(tiny.url).hash);
    expect(r && r.ok).toBe(true);
  });

  it('kaputte Kompressionsdaten: corrupt', async () => {
    const flat = await createShareLink(img(64, 64, i => (i === 0 ? GREEN : RED)), BASE);
    if (!flat.ok) throw new Error('Testlink');
    const bad = mutate(flat.url, b => { const c = b.slice(); for (let i = 2; i < c.length; i++) c[i] = 0xff; return c; });
    expect(await readShareLink(bad)).toEqual({ ok: false, error: 'corrupt' });
  });
});
