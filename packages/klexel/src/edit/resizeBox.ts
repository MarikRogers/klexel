import { MAX_SIZE } from '../model/Document';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export interface Box { x: number; y: number; w: number; h: number }

const clampSize = (v: number) => Math.min(MAX_SIZE, Math.max(1, v));

/**
 * Neues Rechteck, wenn ein Griff um (dx, dy) Dokumentpixel gezogen wird.
 * Ecken: proportional (der größere Achsenfaktor gewinnt), Balken: nur eine Achse. Die Gegenseite bleibt fest,
 * Größen sind ganze Pixel zwischen 1 und 128.
 */
export function resizeBox(handle: HandleId, start: Box, dx: number, dy: number): Box {
  const right = start.x + start.w, bottom = start.y + start.h;
  const west = handle.includes('w'), north = handle.includes('n');
  const east = handle.includes('e'), south = handle.includes('s');
  const isCorner = handle.length === 2;

  let w = start.w, h = start.h;
  if (isCorner) {
    const newW = start.w + (east ? dx : -dx), newH = start.h + (south ? dy : -dy);
    const lo = Math.max(1 / start.w, 1 / start.h), hi = Math.min(MAX_SIZE / start.w, MAX_SIZE / start.h);
    const s = Math.min(hi, Math.max(lo, Math.max(newW / start.w, newH / start.h)));
    w = clampSize(Math.round(start.w * s));
    h = clampSize(Math.round(start.h * s));
  } else if (east || west) {
    w = clampSize(start.w + Math.round(east ? dx : -dx));
  } else {
    h = clampSize(start.h + Math.round(south ? dy : -dy));
  }

  return { x: west ? right - w : start.x, y: north ? bottom - h : start.y, w, h };
}
