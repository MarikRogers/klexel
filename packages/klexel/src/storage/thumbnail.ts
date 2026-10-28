import { pixelsToRgba, rgbaToDataUrl } from '@suite/shared/ui';

// Verkleinert 0xRRGGBBAA-Pixel per Nearest-Neighbor auf höchstens max Kantenlänge (DOM-frei).
export function thumbnailPixels(pixels: Uint32Array, w: number, h: number, max = 48): { w: number; h: number; rgba: Uint8ClampedArray } {
  const scale = Math.min(1, max / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const scaled = new Uint32Array(tw * th);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / th));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / tw));
      scaled[y * tw + x] = pixels[sy * w + sx];
    }
  }
  const rgba = pixelsToRgba(scaled);
  return { w: tw, h: th, rgba };
}

// Nur Laufzeit (Canvas).
export function rgbaToPngDataUrl(w: number, h: number, rgba: Uint8ClampedArray): string {
  return rgbaToDataUrl(w, h, rgba);
}
