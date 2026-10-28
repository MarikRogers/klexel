import { MAX_SIZE } from '../model/Document';
import { quantize } from '../photo/quantize';
import type { Floating } from './SelectionSession';

/** Ab dieser Zahl verschiedener Farben wird beim Verkleinern nicht mehr auf die Quellfarben abgebildet. */
export const MAX_SCALE_COLORS = 256;
const OPAQUE_FROM = 128;

type Weights = Array<Array<[number, number]>>;

/** Je Zielindex die beteiligten Quellindizes mit Gewicht: Vergrößern/gleich = Nächster Nachbar, Verkleinern = Flächenanteile. */
function axisWeights(src: number, dst: number): Weights {
  const out: Weights = [];
  if (dst >= src) {
    for (let o = 0; o < dst; o++) out.push([[Math.min(src - 1, Math.floor(((o + 0.5) * src) / dst)), 1]]);
    return out;
  }
  const s = src / dst;
  for (let o = 0; o < dst; o++) {
    const a = o * s, b = a + s, list: Array<[number, number]> = [];
    for (let i = Math.floor(a); i < Math.ceil(b) && i < src; i++) {
      const w = Math.min(b, i + 1) - Math.max(a, i);
      if (w > 1e-9) list.push([i, w]);
    }
    out.push(list);
  }
  return out;
}

const opaque = (c: number) => ((c & 0xffffff00) | 255) >>> 0;

/**
 * Skaliert eine schwebende Auswahl auf newW × newH. Je Achse: Vergrößern scharf, Verkleinern gemittelt (alpha-gewichtet).
 * Wird mindestens eine Achse kleiner, werden die Farben auf die der Quelle abgebildet (bei mehr als MAX_SCALE_COLORS nur Alpha-Regel).
 */
export function scaleFloating(base: Floating, newW: number, newH: number): { pixels: Uint32Array; mask: Uint8Array } {
  const ok = (v: number) => Number.isInteger(v) && v >= 1 && v <= MAX_SIZE;
  if (!ok(newW) || !ok(newH)) throw new RangeError('Größe muss zwischen 1 und 128 liegen');
  const { w, h, pixels: src, mask: srcMask } = base;
  const wx = axisWeights(w, newW), wy = axisWeights(h, newH);
  const pixels = new Uint32Array(newW * newH), mask = new Uint8Array(newW * newH);

  for (let oy = 0; oy < newH; oy++) {
    for (let ox = 0; ox < newW; ox++) {
      let area = 0, cover = 0, sumA = 0, sumR = 0, sumG = 0, sumB = 0;
      for (const [iy, vy] of wy[oy]) {
        for (const [ix, vx] of wx[ox]) {
          const i = iy * w + ix, wgt = vx * vy;
          area += wgt;
          if (srcMask[i] === 0) continue;
          cover += wgt;
          const v = src[i], a = v & 255;
          sumA += wgt * a;
          sumR += wgt * a * (v >>> 24); sumG += wgt * a * ((v >>> 16) & 255); sumB += wgt * a * ((v >>> 8) & 255);
        }
      }
      const o = oy * newW + ox;
      if (area <= 0 || cover / area < 0.5) continue;
      mask[o] = 1;
      if (sumA <= 0) continue;
      const a = Math.round(sumA / area);
      if (a === 0) continue;
      pixels[o] = (((Math.round(sumR / sumA) << 24) | (Math.round(sumG / sumA) << 16) | (Math.round(sumB / sumA) << 8) | a) >>> 0);
    }
  }

  if (newW >= w && newH >= h) return { pixels, mask };

  // Verkleinert: Farben auf die Farben der Quelle zurückführen
  const seen = new Set<number>();
  for (let i = 0; i < src.length && seen.size <= MAX_SCALE_COLORS; i++) {
    if (srcMask[i] !== 0 && (src[i] & 255) >= OPAQUE_FROM) seen.add(opaque(src[i]));
  }
  if (seen.size >= 1 && seen.size <= MAX_SCALE_COLORS) {
    return { pixels: quantize(pixels, newW, newH, [...seen], 'none', false), mask };
  }
  for (let i = 0; i < pixels.length; i++) {
    const a = pixels[i] & 255;
    pixels[i] = a < OPAQUE_FROM ? 0 : opaque(pixels[i]);
  }
  return { pixels, mask };
}
