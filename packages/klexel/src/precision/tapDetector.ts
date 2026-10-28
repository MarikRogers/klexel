import { exceedsTapThreshold } from '../edit/gestures';

export const TAP_MAX_MS = 300;
export const DOUBLE_GAP_MS = 350;
export const DOUBLE_DIST_PX = 50;

/** Erkennt Tipp, Doppeltipp und Ziehen aus Berührungsdaten; die Zeit wird übergeben (ms). */
export class TapDetector {
  private start: { x: number; y: number; t: number } | null = null;
  private moved = false;
  private prev: { x: number; y: number; t: number } | null = null;

  down(x: number, y: number, t: number): void {
    this.start = { x, y, t };
    this.moved = false;
  }

  /** true, sobald die Berührung die Tipp-Schwelle überschritten hat (dann ist es ein Ziehen). */
  move(x: number, y: number): boolean {
    if (this.start && !this.moved && exceedsTapThreshold(this.start.x, this.start.y, x, y)) this.moved = true;
    return this.moved;
  }

  up(x: number, y: number, t: number): 'tap' | 'doubleTap' | 'drag' {
    const s = this.start;
    this.start = null;
    if (!s || this.moved || t - s.t >= TAP_MAX_MS) { this.prev = null; return 'drag'; }
    const p = this.prev;
    if (p && t - p.t <= DOUBLE_GAP_MS && Math.hypot(x - p.x, y - p.y) < DOUBLE_DIST_PX) {
      this.prev = null;
      return 'doubleTap';
    }
    this.prev = { x, y, t };
    return 'tap';
  }

  /** Verwirft die laufende Berührung und den vorigen Tipp (z. B. wenn ein zweiter Finger dazukommt). */
  cancel(): void {
    this.start = null; this.prev = null; this.moved = false;
  }
}
