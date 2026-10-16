import { PixelDocument, Color } from './Document';

interface Change { i: number; before: Color; after: Color }
type Entry = Change[];

export class History {
  private undoStack: Entry[] = [];
  private redoStack: Entry[] = [];
  private current: Map<number, Change> | null = null;

  constructor(private doc: PixelDocument, private limit = 100) {}

  /** Beginnt einen Strich; alle set()-Aufrufe bis commit() bilden einen Undo-Schritt. */
  begin(): void {
    this.current = new Map();
  }

  set(x: number, y: number, c: Color): boolean {
    if (!this.doc.inBounds(x, y)) return false;
    const i = y * this.doc.width + x;
    const before = this.doc.data[i];
    if (before === c) return false;
    if (this.current) {
      const existing = this.current.get(i);
      if (existing) existing.after = c;
      else this.current.set(i, { i, before, after: c });
    }
    this.doc.data[i] = c;
    return true;
  }

  commit(): void {
    const entry = this.current ? [...this.current.values()] : [];
    this.current = null;
    if (entry.length === 0) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Verwirft den laufenden Strich und stellt die Pixel wieder her. */
  cancel(): void {
    if (!this.current) return;
    for (const ch of this.current.values()) this.doc.data[ch.i] = ch.before;
    this.current = null;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    for (const ch of entry) this.doc.data[ch.i] = ch.before;
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    for (const ch of entry) this.doc.data[ch.i] = ch.after;
    this.undoStack.push(entry);
    return true;
  }
}
