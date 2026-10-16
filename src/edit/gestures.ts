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
