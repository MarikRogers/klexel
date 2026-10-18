import type { History } from '../model/History';
import type { Color } from '../model/Document';
import { linePoints } from '../tools/line';
import { PixelPerfect } from './pixelPerfect';

/** Freihandstrich (Stift, Radierer): Linie zwischen den Zeigerpunkten, auf Wunsch mit Pixel-perfect-Filter. */
export class FreehandStroke {
  private open = false;
  private last: [number, number] | null = null;
  private filter = new PixelPerfect();

  constructor(private getHistory: () => History, private pixelPerfect: () => boolean) {}

  get active(): boolean { return this.open; }

  begin(): void {
    this.getHistory().begin();
    this.open = true; this.last = null; this.filter.reset();
  }

  point(x: number, y: number, c: Color): void {
    if (!this.open) return;
    const h = this.getHistory();
    const pts = this.last ? linePoints(this.last[0], this.last[1], x, y) : [[x, y] as [number, number]];
    for (const [px, py] of pts) {
      if (this.pixelPerfect()) {
        const r = this.filter.push(px, py);
        if (r.unset) h.unset(r.unset[0], r.unset[1]);
        if (r.set) h.set(r.set[0], r.set[1], c);
      } else {
        h.set(px, py, c);
      }
    }
    this.last = [x, y];
  }

  end(commit: boolean): void {
    if (!this.open) return;
    this.open = false; this.last = null;
    const h = this.getHistory();
    if (commit) h.commit(); else h.cancel();
  }
}
