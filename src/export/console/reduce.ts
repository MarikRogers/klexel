import type { Color } from '../../model/Document';
import { PICO8 } from '../../palette/palettes';
import { PICOTRON } from '../../palette/picotron';

export type ConsoleTarget = 'pico8' | 'picotron';

export const TARGET_PALETTE: Record<ConsoleTarget, Color[]> = { pico8: PICO8, picotron: PICOTRON };

/** Alpha-Schwelle: darunter gilt ein Pixel als durchsichtig. */
const OPAQUE_FROM = 128;

function nearest(color: Color, palette: Color[]): number {
  const r = color >>> 24, g = (color >>> 16) & 255, b = (color >>> 8) & 255;
  let best = -1, bestD = Infinity;
  for (let i = 1; i < palette.length; i++) { // Index 0 bleibt dem Durchsichtigen vorbehalten
    const p = palette[i];
    const dr = r - (p >>> 24), dg = g - ((p >>> 16) & 255), db = b - ((p >>> 8) & 255);
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/**
 * Bildet RGBA-Pixel auf Palettenindizes ab. Alpha < 128 → Index 0 (durchsichtig).
 * Deckende Pixel bekommen nie Index 0; trifft eine Farbe exakt Index 0, wird sie wie eine
 * abweichende Farbe auf die nächste andere Palettenfarbe gelegt und als angepasst gezählt.
 */
export function reducePixels(
  pixels: Uint32Array, palette: Color[],
): { indices: Uint8Array; adjusted: Set<Color>; mapped: Uint32Array } {
  const indices = new Uint8Array(pixels.length);
  const mapped = new Uint32Array(pixels.length);
  const adjusted = new Set<Color>();
  const exact = new Map<Color, number>();
  for (let i = 1; i < palette.length; i++) if (!exact.has(palette[i])) exact.set(palette[i], i);
  const cache = new Map<Color, number>();
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i];
    if ((c & 255) < OPAQUE_FROM) continue; // durchsichtig: Index 0, mapped 0
    let idx = exact.get(c);
    if (idx === undefined) {
      idx = cache.get(c);
      if (idx === undefined) { idx = nearest(c, palette); cache.set(c, idx); }
      adjusted.add(c);
    }
    indices[i] = idx;
    mapped[i] = palette[idx];
  }
  return { indices, adjusted, mapped };
}
