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
