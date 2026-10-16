/** Bildschirmdistanz (CSS-px) ab der aus einem Tap eine Geste (Verschieben / Rechteck) wird. */
export const TAP_THRESHOLD_PX = 6;

export function exceedsTapThreshold(downX: number, downY: number, x: number, y: number, thresholdPx = TAP_THRESHOLD_PX): boolean {
  return Math.hypot(x - downX, y - downY) > thresholdPx;
}
