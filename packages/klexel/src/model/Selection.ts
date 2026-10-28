export type SelectionMode = 'replace' | 'add' | 'subtract';
export interface SelectionEdge {
  x: number;
  y: number;
  dir: 'h' | 'v';
}

// Unveränderliche Maske (1 = ausgewählt) über der Dokumentfläche; leer = keine Auswahl
export class Selection {
  private edgeCache: SelectionEdge[] | null = null;

  // Übernimmt die Maske ohne Kopie; Aufrufer geben sie nie wieder her
  private constructor(
    readonly width: number,
    readonly height: number,
    readonly mask: Uint8Array,
  ) {}

  static empty(w: number, h: number): Selection {
    return new Selection(w, h, new Uint8Array(w * h));
  }

  static all(w: number, h: number): Selection {
    return new Selection(w, h, new Uint8Array(w * h).fill(1));
  }

  static rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Selection {
    const mask = new Uint8Array(w * h);
    const xa = Math.max(0, Math.min(x0, x1));
    const xb = Math.min(w - 1, Math.max(x0, x1));
    const ya = Math.max(0, Math.min(y0, y1));
    const yb = Math.min(h - 1, Math.max(y0, y1));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) mask[y * w + x] = 1;
    }
    return new Selection(w, h, mask);
  }

  // Maske einer w×h-Box (z. B. schwebender Inhalt) an Position (x, y), auf die Fläche abgeschnitten
  static fromBox(width: number, height: number, box: Uint8Array, w: number, h: number, x: number, y: number): Selection {
    const mask = new Uint8Array(width * height);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const tx = x + c;
        const ty = y + r;
        if (box[r * w + c] === 1 && tx >= 0 && ty >= 0 && tx < width && ty < height) mask[ty * width + tx] = 1;
      }
    }
    return new Selection(width, height, mask);
  }

  // Even-Odd-Polygon über Pixelmitten: Pixel (x, y) ist gewählt, wenn (x + 0.5, y + 0.5) innen liegt.
  // Der Pfad wird implizit geschlossen; Scanline über die Zeilen, auf die Fläche geklemmt.
  static polygon(w: number, h: number, points: Array<[number, number]>): Selection {
    const mask = new Uint8Array(w * h);
    const pts: Array<[number, number]> = [];
    for (const p of points) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3 || new Set(pts.map(([px, py]) => `${px},${py}`)).size < 3) return new Selection(w, h, mask);

    const xs: number[] = [];
    for (let y = 0; y < h; y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        if (ay <= yc === by <= yc) continue;
        xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const from = Math.max(0, Math.ceil(xs[i] - 0.5));
        const to = Math.min(w - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
        for (let x = from; x <= to; x++) mask[y * w + x] = 1;
      }
    }
    return new Selection(w, h, mask);
  }

  // Zauberstab: Pixel mit der Farbe des Startpixels; contiguous = 4er-Nachbarschaft (ohne Diagonalen).
  // pixels === undefined entspricht einer leeren Cel (lauter 0).
  static region(w: number, h: number, pixels: Uint32Array | undefined, x: number, y: number, contiguous: boolean): Selection {
    if (pixels && pixels.length !== w * h) throw new RangeError('Cel size does not match area');
    const mask = new Uint8Array(w * h);
    if (x < 0 || y < 0 || x >= w || y >= h) return new Selection(w, h, mask);
    const at = (i: number): number => (pixels ? pixels[i] : 0);
    const target = at(y * w + x);
    if (!contiguous) {
      for (let i = 0; i < mask.length; i++) if (at(i) === target) mask[i] = 1;
      return new Selection(w, h, mask);
    }
    const stack: Array<[number, number]> = [[x, y]];
    while (stack.length) {
      const [sx, sy] = stack.pop()!;
      const row = sy * w;
      if (mask[row + sx] === 1 || at(row + sx) !== target) continue;
      let l = sx;
      let r = sx;
      while (l > 0 && mask[row + l - 1] === 0 && at(row + l - 1) === target) l--;
      while (r < w - 1 && mask[row + r + 1] === 0 && at(row + r + 1) === target) r++;
      for (let i = l; i <= r; i++) mask[row + i] = 1;
      for (const ny of [sy - 1, sy + 1]) {
        if (ny < 0 || ny >= h) continue;
        let inRun = false;
        for (let i = l; i <= r; i++) {
          const match = mask[ny * w + i] === 0 && at(ny * w + i) === target;
          if (match && !inRun) stack.push([i, ny]);
          inRun = match;
        }
      }
    }
    return new Selection(w, h, mask);
  }

  combine(other: Selection, mode: SelectionMode): Selection {
    if (other.width !== this.width || other.height !== this.height) {
      throw new RangeError('Selection sizes differ');
    }
    const mask = new Uint8Array(this.mask.length);
    for (let i = 0; i < mask.length; i++) {
      if (mode === 'replace') mask[i] = other.mask[i];
      else if (mode === 'add') mask[i] = this.mask[i] | other.mask[i];
      else mask[i] = this.mask[i] & (other.mask[i] ^ 1);
    }
    return new Selection(this.width, this.height, mask);
  }

  isEmpty(): boolean {
    return !this.mask.includes(1);
  }

  count(): number {
    let n = 0;
    for (let i = 0; i < this.mask.length; i++) n += this.mask[i];
    return n;
  }

  contains(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.mask[y * this.width + x] === 1;
  }

  bounds(): { x: number; y: number; w: number; h: number } | null {
    let minX = this.width;
    let minY = this.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.mask[y * this.width + x] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  translated(dx: number, dy: number): Selection {
    const mask = new Uint8Array(this.mask.length);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.mask[y * this.width + x] === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height) {
          mask[ny * this.width + nx] = 1;
        }
      }
    }
    return new Selection(this.width, this.height, mask);
  }

  // 'h': Kante über Pixel (x, y); 'v': Kante links von Pixel (x, y).
  // Randkante, wenn genau eines der beiden angrenzenden Pixel ausgewählt ist.
  edges(): SelectionEdge[] {
    if (this.edgeCache) return this.edgeCache;
    const out: SelectionEdge[] = [];
    for (let y = 0; y <= this.height; y++) {
      for (let x = 0; x <= this.width; x++) {
        const here = this.contains(x, y);
        if (x < this.width && here !== this.contains(x, y - 1)) out.push({ x, y, dir: 'h' });
        if (y < this.height && here !== this.contains(x - 1, y)) out.push({ x, y, dir: 'v' });
      }
    }
    this.edgeCache = out;
    return out;
  }
}
