export const MAX_SIDE = 64;
export const MAX_COLORS = 32;
const OPAQUE_FROM = 128;

export interface DecodedImage { width: number; height: number; pixels: Uint32Array } // 0xRRGGBBAA, transparent = 0
export type EncodeProblem = { kind: 'empty' | 'too-large' | 'too-many-colors'; colors?: number };
export type DecodeError = 'corrupt';

/** Bits je Pixel für `count` mögliche Indizes (0 bei höchstens einem). */
function bitsFor(count: number): number {
  let bits = 0;
  while ((1 << bits) < count) bits++;
  return bits;
}

/**
 * Baut den Byte-Block ab `w`: w, h, n, n×RGB, Pixel-Indizes dicht gepackt (MSB zuerst).
 * Alpha < 128 = transparent; mit Transparenz ist Index 0 transparent und Farbe k ist Palettenfarbe k−1.
 */
export function encodeImage(width: number, height: number, pixels: Uint32Array):
  { ok: true; transparent: boolean; body: Uint8Array } | { ok: false; problem: EncodeProblem } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) {
    return { ok: false, problem: { kind: 'too-large' } };
  }
  const palette = new Map<number, number>(); // RGB → Palettenindex
  let transparent = false;
  for (let i = 0; i < width * height; i++) {
    const v = pixels[i];
    if ((v & 255) < OPAQUE_FROM) { transparent = true; continue; }
    const rgb = v >>> 8;
    if (!palette.has(rgb)) palette.set(rgb, palette.size);
  }
  if (palette.size === 0) return { ok: false, problem: { kind: 'empty' } };
  if (palette.size > MAX_COLORS) return { ok: false, problem: { kind: 'too-many-colors', colors: palette.size } };

  const n = palette.size, t = transparent ? 1 : 0, bits = bitsFor(n + t);
  const packed = new Uint8Array(Math.ceil((width * height * bits) / 8));
  if (bits > 0) {
    for (let i = 0; i < width * height; i++) {
      const v = pixels[i];
      const idx = (v & 255) < OPAQUE_FROM ? 0 : palette.get(v >>> 8)! + t;
      for (let b = 0; b < bits; b++) {
        if ((idx >> (bits - 1 - b)) & 1) {
          const pos = i * bits + b;
          packed[pos >> 3] |= 0x80 >> (pos & 7);
        }
      }
    }
  }
  const body = new Uint8Array(3 + n * 3 + packed.length);
  body[0] = width; body[1] = height; body[2] = n;
  for (const [rgb, k] of palette) {
    body[3 + k * 3] = (rgb >>> 16) & 255; body[4 + k * 3] = (rgb >>> 8) & 255; body[5 + k * 3] = rgb & 255;
  }
  body.set(packed, 3 + n * 3);
  return { ok: true, transparent, body };
}

/** Liest den Byte-Block strikt; alles Unstimmige ist 'corrupt'. */
export function decodeBody(body: Uint8Array, transparent: boolean):
  { ok: true; image: DecodedImage; colors: number } | { ok: false; error: DecodeError } {
  const fail = { ok: false, error: 'corrupt' } as const;
  if (body.length < 3) return fail;
  const w = body[0], h = body[1], n = body[2];
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || n > MAX_COLORS) return fail;
  const t = transparent ? 1 : 0, bits = bitsFor(n + t);
  const packedLen = Math.ceil((w * h * bits) / 8);
  if (body.length !== 3 + n * 3 + packedLen) return fail;
  if (n === 0) return fail; // ein Bild ohne deckende Pixel wird nie geschrieben
  const colors = Array.from({ length: n }, (_, k) =>
    (((body[3 + k * 3] << 24) | (body[4 + k * 3] << 16) | (body[5 + k * 3] << 8) | 0xff) >>> 0));
  const base = 3 + n * 3;
  const pixels = new Uint32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    let idx = 0;
    for (let b = 0; b < bits; b++) {
      const pos = i * bits + b;
      idx = (idx << 1) | ((body[base + (pos >> 3)] >> (7 - (pos & 7))) & 1);
    }
    if (t === 1 && idx === 0) continue; // transparent: bleibt 0
    const k = idx - t;
    if (k >= n) return fail;
    pixels[i] = colors[k];
  }
  // Restbits des letzten Bytes müssen 0 sein
  const used = w * h * bits;
  if (used % 8 !== 0 && (body[base + packedLen - 1] & (0xff >> (used % 8))) !== 0) return fail;
  return { ok: true, image: { width: w, height: h, pixels }, colors: n };
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += ALPHABET[b0 >> 2] + ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (i + 1 < bytes.length) out += ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (i + 2 < bytes.length) out += ALPHABET[b2 & 63];
  }
  return out;
}

/** null bei unzulässigen Zeichen oder unmöglicher Länge (Rest 1). */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const vals: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const v = c < 128 ? LOOKUP[c] : -1;
    if (v < 0) return null;
    vals.push(v);
  }
  const out = new Uint8Array(Math.floor((vals.length * 6) / 8));
  let o = 0;
  for (let i = 0; i < vals.length; i += 4) {
    const [a, b, c, d] = [vals[i], vals[i + 1], vals[i + 2], vals[i + 3]];
    out[o++] = (a << 2) | (b >> 4);
    if (c !== undefined) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}
