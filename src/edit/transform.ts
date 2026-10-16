import type { Floating } from './SelectionSession';

export function flipFloating(f: Floating, axis: 'h' | 'v'): Floating {
  const pixels = new Uint32Array(f.pixels.length);
  const mask = new Uint8Array(f.mask.length);
  for (let r = 0; r < f.h; r++) {
    for (let c = 0; c < f.w; c++) {
      const to = axis === 'h' ? r * f.w + (f.w - 1 - c) : (f.h - 1 - r) * f.w + c;
      pixels[to] = f.pixels[r * f.w + c];
      mask[to] = f.mask[r * f.w + c];
    }
  }
  return { ...f, pixels, mask };
}

// Im Uhrzeigersinn; trunc statt round, damit vier Drehungen exakt zur Ausgangsposition führen
export function rotateFloating90(f: Floating): Floating {
  const pixels = new Uint32Array(f.pixels.length);
  const mask = new Uint8Array(f.mask.length);
  for (let r = 0; r < f.h; r++) {
    for (let c = 0; c < f.w; c++) {
      const to = c * f.h + (f.h - 1 - r);
      pixels[to] = f.pixels[r * f.w + c];
      mask[to] = f.mask[r * f.w + c];
    }
  }
  return {
    pixels,
    mask,
    w: f.h,
    h: f.w,
    x: f.x + Math.trunc((f.w - f.h) / 2),
    y: f.y + Math.trunc((f.h - f.w) / 2),
  };
}
