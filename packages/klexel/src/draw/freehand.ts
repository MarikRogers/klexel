import type { History } from '../model/History';
import type { Color } from '../model/Document';
import { linePoints } from '../tools/line';
import { PixelPerfect } from './pixelPerfect';

/** Freihandstrich (Stift, Radierer): Linie zwischen den Zeigerpunkten, auf Wunsch mit Pixel-perfect-Filter. */
export class FreehandStroke {
  private open = false;
  private last: [number, number] | null = null;
  private filter = new PixelPerfect();

  constructor(private getHistory: () => History, private pixelPerfect: () => boolean, private getSize: () => number = () => 1) {}

  get active(): boolean { return this.open; }

  begin(): void {
    this.getHistory().begin();
    this.open = true; this.last = null; this.filter.reset();
  }

  point(x: number, y: number, c: Color): void {
    if (!this.open) return;
    const h = this.getHistory();
    const pts = this.last ? linePoints(this.last[0], this.last[1], x, y) : [[x, y] as [number, number]];
    const size = Math.max(1, Math.floor(this.getSize()));
    for (const [px, py] of pts) {
      if (size > 1) {
        // Quadratischer Stempel um den Punkt; der Pixel-perfect-Filter gilt nur für Strichstärke 1
        const o = Math.floor((size - 1) / 2);
        for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) h.set(px - o + dx, py - o + dy, c);
      } else if (this.pixelPerfect()) {
        const r = this.filter.push(px, py);
        if (r.unset) h.unset(r.unset[0], r.unset[1]);
        if (r.set) h.set(r.set[0], r.set[1], c);
      } else {
        h.set(px, py, c);
      }
    }
    this.last = [x, y];
  }

  /** Beendet den Strich; true, wenn dabei ein Undo-Schritt entstanden ist. */
  end(commit: boolean): boolean {
    if (!this.open) return false;
    this.open = false; this.last = null;
    const h = this.getHistory();
    if (commit) return h.commit();
    h.cancel();
    return false;
  }
}
