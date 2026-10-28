/** Bildschirmdistanz (CSS-px) ab der aus einem Tap eine Geste (Verschieben / Rechteck) wird. */
export const TAP_THRESHOLD_PX = 6;

export function exceedsTapThreshold(downX: number, downY: number, x: number, y: number, thresholdPx = TAP_THRESHOLD_PX): boolean {
  return Math.hypot(x - downX, y - downY) > thresholdPx;
}

/** Lasso: Dokumentpixel anhängen, aufeinanderfolgende Duplikate entfallen. Liefert, ob sich der Pfad geändert hat. */
export function appendPathPoint(points: Array<[number, number]>, x: number, y: number): boolean {
  const l = points[points.length - 1];
  if (l && l[0] === x && l[1] === y) return false;
  points.push([x, y]);
  return true;
}

export type SelShape = 'rect' | 'lasso' | 'wand';
export type SelGestureKind = 'move' | 'rect' | 'lasso' | 'wand' | 'deselect' | 'none';

/**
 * Was eine Auswahl-Geste bewirkt. `startedInside`: Zeiger begann in der Auswahl im Modus Neu.
 * Über der Schwelle: Verschieben bzw. Form aufziehen; darunter (Tap): Zauberstab immer, sonst Abwählen (nur Neu, außerhalb).
 */
export function classifyGesture(shape: SelShape, mode: 'replace' | 'add' | 'subtract', startedInside: boolean, exceeded: boolean): SelGestureKind {
  if (exceeded) return startedInside ? 'move' : shape === 'wand' ? 'none' : shape;
  if (shape === 'wand') return 'wand';
  return !startedInside && mode === 'replace' ? 'deselect' : 'none';
}
