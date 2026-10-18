import type { Hand } from './settings';

/** Abstand des Cursors zum Finger in CSS-Pixeln: nach oben, und zur Seite, von der die Hand nicht kommt. */
export const OFFSET_Y = 84;
export const OFFSET_X = 28;

export interface ViewGeom { panX: number; panY: number; zoom: number }

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

/**
 * Fingerposition (Canvas-lokal, CSS-px) → Cursorzelle im Dokument.
 * Rechtshänder: Cursor oben links vom Finger, Linkshänder: oben rechts. Ergebnis liegt immer im Dokument.
 */
export function fingerToCell(
  sx: number, sy: number, hand: Hand, v: ViewGeom, docW: number, docH: number,
): [number, number] {
  const x = Math.floor((sx + (hand === 'R' ? -OFFSET_X : OFFSET_X) - v.panX) / v.zoom);
  const y = Math.floor((sy - OFFSET_Y - v.panY) / v.zoom);
  return [clamp(x, docW - 1), clamp(y, docH - 1)];
}
