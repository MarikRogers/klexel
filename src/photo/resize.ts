import { MAX_SIZE } from '../model/Document';

export type FitMode = 'crop' | 'fit' | 'keep';
export interface PhotoImage { width: number; height: number; pixels: Uint32Array }
export interface ResizeOptions { mode: FitMode; width: number; height: number; longest: number; panX: number; panY: number }
/** Rechteck in Quellpixeln; darf gebrochene Werte haben. */
export interface Rect { x: number; y: number; w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampSize = (v: number) => clamp(Math.round(Number.isFinite(v) ? v : 1), 1, MAX_SIZE);

/** "Verhältnis behalten": die längste Seite wird vorgegeben, die andere folgt dem Foto (mindestens 1). */
export function keepSize(srcW: number, srcH: number, longest: number): { width: number; height: number } {
  const L = clampSize(longest);
  if (srcW >= srcH) return { width: L, height: Math.max(1, Math.round((L * srcH) / srcW)) };
  return { width: Math.max(1, Math.round((L * srcW) / srcH)), height: L };
}

/** Größter Ausschnitt im Zielverhältnis tw:th; pan 0 = links/oben, 1 = rechts/unten (wird geklemmt). */
export function cropRect(srcW: number, srcH: number, tw: number, th: number, panX: number, panY: number): Rect {
  const scale = Math.min(srcW / tw, srcH / th);
  const w = tw * scale, h = th * scale;
  return { x: clamp(panX, 0, 1) * (srcW - w), y: clamp(panY, 0, 1) * (srcH - h), w, h };
}

/** Flächenmittel (alpha-gewichtet) des Quellrechtecks auf outW×outH. */
export function boxResize(src: PhotoImage, rect: Rect, outW: number, outH: number): Uint32Array {
  const out = new Uint32Array(outW * outH);
  const sw = rect.w / outW, sh = rect.h / outH;
  for (let oy = 0; oy < outH; oy++) {
    const y0 = rect.y + oy * sh, y1 = y0 + sh;
    for (let ox = 0; ox < outW; ox++) {
      const x0 = rect.x + ox * sw, x1 = x0 + sw;
      let area = 0, sumA = 0, sumR = 0, sumG = 0, sumB = 0;
      for (let iy = Math.floor(y0); iy < Math.ceil(y1); iy++) {
        const wy = Math.min(y1, iy + 1) - Math.max(y0, iy);
        if (wy <= 0) continue;
        const sy = clamp(iy, 0, src.height - 1);
        for (let ix = Math.floor(x0); ix < Math.ceil(x1); ix++) {
          const wx = Math.min(x1, ix + 1) - Math.max(x0, ix);
          if (wx <= 0) continue;
          const v = src.pixels[sy * src.width + clamp(ix, 0, src.width - 1)];
          const wgt = wx * wy, a = v & 255;
          area += wgt; sumA += wgt * a;
          sumR += wgt * a * (v >>> 24); sumG += wgt * a * ((v >>> 16) & 255); sumB += wgt * a * ((v >>> 8) & 255);
        }
      }
      if (area <= 0 || sumA <= 0) continue; // transparent: 0
      const a = Math.round(sumA / area);
      if (a === 0) continue;
      out[oy * outW + ox] = (((Math.round(sumR / sumA) << 24) | (Math.round(sumG / sumA) << 16) | (Math.round(sumB / sumA) << 8) | a) >>> 0);
    }
  }
  return out;
}

/** Verkleinert das Foto nach Modus (Zuschneiden / Einpassen / Verhältnis behalten). */
export function resizePhoto(src: PhotoImage, o: ResizeOptions): PhotoImage {
  const whole: Rect = { x: 0, y: 0, w: src.width, h: src.height };
  if (o.mode === 'keep') {
    const { width, height } = keepSize(src.width, src.height, o.longest);
    return { width, height, pixels: boxResize(src, whole, width, height) };
  }
  const width = clampSize(o.width), height = clampSize(o.height);
  if (o.mode === 'crop') {
    return { width, height, pixels: boxResize(src, cropRect(src.width, src.height, width, height, o.panX, o.panY), width, height) };
  }
  // fit: ganzes Foto in die Zielgröße einpassen, mittig, Ränder transparent
  const scale = Math.min(width / src.width, height / src.height);
  const pw = Math.max(1, Math.min(width, Math.round(src.width * scale)));
  const ph = Math.max(1, Math.min(height, Math.round(src.height * scale)));
  const placed = boxResize(src, whole, pw, ph);
  const pixels = new Uint32Array(width * height);
  const ox = Math.floor((width - pw) / 2), oy = Math.floor((height - ph) / 2);
  for (let y = 0; y < ph; y++) pixels.set(placed.subarray(y * pw, (y + 1) * pw), (oy + y) * width + ox);
  return { width, height, pixels };
}
