import type { HandleId } from './resizeBox';

export interface ScreenRect { x: number; y: number; w: number; h: number }
export interface HandleGeom {
  id: HandleId;
  kind: 'corner' | 'bar';
  /** Mitte der sichtbaren Form (Bildschirmpixel, Canvas-lokal) */
  cx: number;
  cy: number;
  /** Touchfläche; liegt nie im Rechteck der Auswahl, kann am Rand der Fläche kleiner als `touch` sein */
  zone: ScreenRect;
}

/** Sichtbare Größe der Griffe in Bildschirmpixeln (unabhängig vom Zoom) */
export const HANDLE_CORNER_PX = 20;
export const HANDLE_BAR_LONG_PX = 40;
export const HANDLE_BAR_SHORT_PX = 8;

const ORDER: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Lage der acht Griffe um `box` (Canvas-lokale Bildschirmpixel). Die Zonen liegen außerhalb des Rechtecks,
 * werden in die sichtbare Fläche geschoben und danach am Rechteck abgeschnitten, damit das Innere frei bleibt.
 */
export function handleLayout(box: ScreenRect, view: { width: number; height: number }, touch = 44): HandleGeom[] {
  const right = box.x + box.w, bottom = box.y + box.h;
  const midX = box.x + box.w / 2 - touch / 2, midY = box.y + box.h / 2 - touch / 2;
  const raw: Record<HandleId, [number, number]> = {
    nw: [box.x - touch, box.y - touch], n: [midX, box.y - touch], ne: [right, box.y - touch],
    e: [right, midY], se: [right, bottom], s: [midX, bottom],
    sw: [box.x - touch, bottom], w: [box.x - touch, midY],
  };

  return ORDER.map(id => {
    let x = clamp(raw[id][0], 0, Math.max(0, view.width - touch));
    let y = clamp(raw[id][1], 0, Math.max(0, view.height - touch));
    let w = touch, h = touch;
    if (id.includes('n') && y + h > box.y) h = Math.max(0, box.y - y);
    if (id.includes('s') && y < bottom) { const d = bottom - y; y = bottom; h = Math.max(0, h - d); }
    if (id.includes('w') && x + w > box.x) w = Math.max(0, box.x - x);
    if (id.includes('e') && x < right) { const d = right - x; x = right; w = Math.max(0, w - d); }
    return {
      id,
      kind: id.length === 2 ? 'corner' : 'bar',
      cx: x + w / 2, cy: y + h / 2,
      zone: { x, y, w, h },
    } satisfies HandleGeom;
  });
}

const contains = (z: ScreenRect, x: number, y: number) => z.w > 0 && z.h > 0 && x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;

/** Welcher Griff liegt unter dem Finger? Ecken haben Vorrang vor Balken, bei mehreren gewinnt der nächste. */
export function hitHandle(handles: HandleGeom[], x: number, y: number): HandleId | null {
  for (const kind of ['corner', 'bar'] as const) {
    let best: HandleGeom | null = null, bestD = Infinity;
    for (const h of handles) {
      if (h.kind !== kind || !contains(h.zone, x, y)) continue;
      const d = Math.hypot(x - h.cx, y - h.cy);
      if (d < bestD) { best = h; bestD = d; }
    }
    if (best) return best.id;
  }
  return null;
}
