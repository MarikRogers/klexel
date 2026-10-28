export type Pt = [number, number];

export interface PerfectResult {
  /** Mittleres Pixel einer L-Ecke, das wieder entfernt werden soll */
  unset: Pt | null;
  /** Neues Pixel, das gesetzt werden soll (null, wenn der Punkt dem letzten gleicht) */
  set: Pt | null;
}

/** a und c sind diagonal benachbart, b grenzt orthogonal an beide. */
export function isLCorner(a: Pt, b: Pt, c: Pt): boolean {
  const diag = Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1;
  const adj = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) === 1;
  return diag && adj(a, b) && adj(b, c);
}

/** Filter über die Folge der Strichpixel: entfernt die mittleren Pixel von L-Ecken. */
export class PixelPerfect {
  private kept: Pt[] = [];

  reset(): void { this.kept = []; }

  push(x: number, y: number): PerfectResult {
    const n = this.kept.length;
    const last = this.kept[n - 1];
    if (last && last[0] === x && last[1] === y) return { unset: null, set: null };
    const p: Pt = [x, y];
    let unset: Pt | null = null;
    if (n >= 2 && isLCorner(this.kept[n - 2], last, p)) unset = this.kept.pop()!;
    this.kept.push(p);
    return { unset, set: p };
  }
}
