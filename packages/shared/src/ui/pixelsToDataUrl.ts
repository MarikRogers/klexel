// 0xRRGGBBAA-Pixel -> RGBA-Bytes (DOM-frei, getestet).
export function pixelsToRgba(pixels: Uint32Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i];
    const o = i * 4;
    rgba[o] = p >>> 24;
    rgba[o + 1] = (p >>> 16) & 255;
    rgba[o + 2] = (p >>> 8) & 255;
    rgba[o + 3] = p & 255;
  }
  return rgba;
}

// Zeichnet RGBA-Bytes auf ein Canvas und liefert eine PNG-Data-URL (nur Laufzeit, nicht unit-getestet).
export function rgbaToDataUrl(width: number, height: number, rgba: Uint8ClampedArray): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  // createImageData + set statt new ImageData(rgba): kommt ohne den generischen Typ Uint8ClampedArray<ArrayBuffer>
  // aus, den Rigsprites älteres TypeScript nicht kennt (Rigsprite bindet '@suite/shared/ui' ein)
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function pixelsToDataUrl(width: number, height: number, pixels: Uint32Array): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new RangeError('Ungültige Bildgröße');
  if (pixels.length !== width * height) throw new RangeError('Pixelanzahl passt nicht zur Bildgröße');
  return rgbaToDataUrl(width, height, pixelsToRgba(pixels));
}
