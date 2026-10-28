// Verkleinert 0xRRGGBBAA-Pixel per Nearest-Neighbor auf höchstens max Kantenlänge (DOM-frei).
export function thumbnailPixels(pixels: Uint32Array, w: number, h: number, max = 48): { w: number; h: number; rgba: Uint8ClampedArray } {
  const scale = Math.min(1, max / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const rgba = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / th));
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / tw));
      const p = pixels[sy * w + sx];
      const o = (y * tw + x) * 4;
      rgba[o] = p >>> 24;
      rgba[o + 1] = (p >>> 16) & 255;
      rgba[o + 2] = (p >>> 8) & 255;
      rgba[o + 3] = p & 255;
    }
  }
  return { w: tw, h: th, rgba };
}

// Nur Laufzeit (Canvas).
export function rgbaToPngDataUrl(w: number, h: number, rgba: Uint8ClampedArray): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c.toDataURL('image/png');
}
