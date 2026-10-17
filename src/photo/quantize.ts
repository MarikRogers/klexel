import type { Color } from '../model/Document';

export type Dither = 'none' | 'bayer' | 'floyd';

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const BAYER_STEP = 64; // Streuung in Farbwerten (±32)
const OPAQUE_FROM = 128;

const clamp255 = (v: number) => Math.min(255, Math.max(0, v));

/**
 * Bildet RGBA-Pixel auf die Palette ab. Alpha < 128 bleibt 0 (transparent), alle anderen Pixel werden deckend.
 * skipFirst: palette[0] wird nie gewählt (bei PICO-8/Picotron ist Index 0 "durchsichtig").
 */
export function quantize(
  pixels: Uint32Array, width: number, height: number, palette: Color[], dither: Dither, skipFirst: boolean,
): Uint32Array {
  const first = skipFirst ? 1 : 0;
  if (palette.length - first < 1) throw new RangeError('Palette zu klein');
  const pr = palette.map(c => c >>> 24), pg = palette.map(c => (c >>> 16) & 255), pb = palette.map(c => (c >>> 8) & 255);

  const nearest = (r: number, g: number, b: number): number => {
    let best = first, bestD = Infinity;
    for (let i = first; i < palette.length; i++) {
      const dr = r - pr[i], dg = g - pg[i], db = b - pb[i];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const out = new Uint32Array(pixels.length);
  // Floyd-Steinberg: Fehler je Kanal in Fließkommafeldern
  const err = dither === 'floyd' ? new Float32Array(pixels.length * 3) : null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, v = pixels[i];
      if ((v & 255) < OPAQUE_FROM) continue;
      let r = v >>> 24, g = (v >>> 16) & 255, b = (v >>> 8) & 255;
      if (dither === 'bayer') {
        const t = ((BAYER[y & 3][x & 3] + 0.5) / 16 - 0.5) * BAYER_STEP;
        r = clamp255(r + t); g = clamp255(g + t); b = clamp255(b + t);
      } else if (err) {
        r = clamp255(r + err[i * 3]); g = clamp255(g + err[i * 3 + 1]); b = clamp255(b + err[i * 3 + 2]);
      }
      const k = nearest(r, g, b);
      out[i] = ((pr[k] << 24) | (pg[k] << 16) | (pb[k] << 8) | 0xff) >>> 0;
      if (err) {
        const er = r - pr[k], eg = g - pg[k], eb = b - pb[k];
        const spread = (dx: number, dy: number, w: number) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny >= height) return;
          const j = ny * width + nx;
          if ((pixels[j] & 255) < OPAQUE_FROM) return; // transparente Nachbarn bekommen keinen Fehler
          err[j * 3] += er * w; err[j * 3 + 1] += eg * w; err[j * 3 + 2] += eb * w;
        };
        spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
      }
    }
  }
  return out;
}
