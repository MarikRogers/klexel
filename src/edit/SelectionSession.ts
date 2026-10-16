import { PixelDocument, blendOver } from '../model/Document';
import { History } from '../model/History';
import { Selection, SelectionMode } from '../model/Selection';
import { flipFloating, rotateFloating90 } from './transform';

export interface Floating { pixels: Uint32Array; mask: Uint8Array; w: number; h: number; x: number; y: number }
export interface Clip { pixels: Uint32Array; mask: Uint8Array; w: number; h: number }
export type LiftResult = 'ok' | 'locked' | 'hidden' | 'none';

export function undoAction(session: SelectionSession): 'cancel' | 'undo' {
  return session.isFloating ? 'cancel' : 'undo';
}

/**
 * Auswahl mit Schweben. Vertrag: Die UI soll commit() aufrufen, bevor Ebene oder Frame
 * gewechselt oder Fenster geöffnet werden; tut sie es nicht, bleibt die Sitzung konsistent
 * und schreibt in Ebene und Frame vom Anheben. Undo/Redo dürfen nicht bei offenem Strich
 * (isFloating) aufgerufen werden. reset() bricht einen offenen Strich ab.
 */
export class SelectionSession {
  // Während des Schwebens bleibt die Maske an der Ausgangsposition (für Abbrechen)
  private mask: Selection | null = null;
  private float: Floating | null = null;
  private liftTarget = { layerId: 0, frameId: 0 };
  private clipboard: Clip | null = null;
  private placed: Selection | null = null;

  constructor(private getDoc: () => PixelDocument, private getHistory: () => History) {}

  get selection(): Selection | null {
    const f = this.float;
    if (!this.mask || !f) return this.mask;
    if (!this.placed) {
      const doc = this.getDoc();
      this.placed = Selection.fromBox(doc.width, doc.height, f.mask, f.w, f.h, f.x, f.y);
    }
    return this.placed;
  }

  get floating(): Floating | null { return this.float; }
  get clip(): Clip | null { return this.clipboard; }
  get hasSelection(): boolean { return this.mask !== null; }
  get isFloating(): boolean { return this.float !== null; }

  select(shape: Selection, mode: SelectionMode): void {
    this.commit();
    const base = this.mask ?? Selection.empty(shape.width, shape.height);
    const result = base.combine(shape, mode);
    this.mask = result.isEmpty() ? null : result;
  }

  selectAll(): void {
    this.commit();
    const doc = this.getDoc();
    this.mask = Selection.all(doc.width, doc.height);
  }

  deselect(): void {
    this.commit();
    this.mask = null;
  }

  hitTest(x: number, y: number): boolean {
    return this.selection?.contains(x, y) ?? false;
  }

  lift(): LiftResult {
    if (this.float) return 'ok';
    const mask = this.mask;
    const b = mask?.bounds();
    if (!mask || !b) return 'none';
    const doc = this.getDoc();
    const block = doc.drawBlockReason();
    if (block) return block;
    const history = this.getHistory();
    const cel = doc.cel(doc.activeId, doc.currentFrameId);
    const pixels = new Uint32Array(b.w * b.h);
    const fmask = new Uint8Array(b.w * b.h);
    history.begin();
    this.liftTarget = { layerId: doc.activeId, frameId: doc.currentFrameId };
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        if (!mask.contains(b.x + x, b.y + y)) continue;
        fmask[y * b.w + x] = 1;
        pixels[y * b.w + x] = cel?.[(b.y + y) * doc.width + b.x + x] ?? 0;
        history.set(b.x + x, b.y + y, 0);
      }
    }
    this.float = { pixels, mask: fmask, w: b.w, h: b.h, x: b.x, y: b.y };
    this.placed = null;
    return 'ok';
  }

  moveBy(dx: number, dy: number): LiftResult {
    const r = this.lift();
    if (r !== 'ok' || !this.float) return r;
    this.float.x += dx;
    this.float.y += dy;
    this.placed = null;
    return 'ok';
  }

  commit(): void {
    const f = this.float;
    if (!f) return;
    const doc = this.getDoc();
    const history = this.getHistory();
    const base = doc.cel(this.liftTarget.layerId, this.liftTarget.frameId);
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        const px = f.pixels[i];
        if (f.mask[i] === 0 || (px & 255) === 0) continue;
        const tx = f.x + x;
        const ty = f.y + y;
        if (!doc.inBounds(tx, ty)) continue;
        history.set(tx, ty, blendOver(base?.[ty * doc.width + tx] ?? 0, px, 100));
      }
    }
    history.commit();
    const placed = this.selection!;
    this.mask = placed.isEmpty() ? null : placed;
    this.float = null;
    this.placed = null;
  }

  cancel(): void {
    if (!this.float) return;
    this.getHistory().cancel();
    this.float = null;
    this.placed = null;
    if (this.mask?.isEmpty()) this.mask = null;
  }

  flip(axis: 'h' | 'v'): LiftResult {
    return this.transform((f) => flipFloating(f, axis));
  }

  rotate90(): LiftResult {
    return this.transform(rotateFloating90);
  }

  copy(): boolean {
    const clip = this.float ? this.clipFromFloating(this.float) : this.clipFromCel();
    if (!clip) return false;
    this.clipboard = clip;
    return true;
  }

  cut(): LiftResult {
    const r = this.guard();
    if (r !== 'ok') return r;
    this.copy();
    return this.delete();
  }

  delete(): LiftResult {
    const r = this.guard();
    if (r !== 'ok') return r;
    const history = this.getHistory();
    if (this.float) {
      // Quelle bleibt gelöscht; die Maske bleibt an der aktuellen Position
      history.commit();
      const placed = this.selection!;
      this.mask = placed.isEmpty() ? null : placed;
      this.float = null;
      this.placed = null;
      return 'ok';
    }
    const doc = this.getDoc();
    const mask = this.mask!;
    history.begin();
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        if (mask.contains(x, y)) history.set(x, y, 0);
      }
    }
    history.commit();
    return 'ok';
  }

  paste(centerX: number, centerY: number): LiftResult {
    const clip = this.clipboard;
    if (!clip) return 'none';
    const doc = this.getDoc();
    const block = doc.drawBlockReason();
    if (block) return block;
    this.commit();
    this.getHistory().begin();
    this.liftTarget = { layerId: doc.activeId, frameId: doc.currentFrameId };
    this.float = {
      pixels: clip.pixels.slice(),
      mask: clip.mask.slice(),
      w: clip.w,
      h: clip.h,
      x: Math.round(centerX - clip.w / 2),
      y: Math.round(centerY - clip.h / 2),
    };
    this.placed = null;
    // Die Maske gehört zum Einfügen: Abbrechen lässt sie an dieser Position
    this.mask = Selection.fromBox(doc.width, doc.height, clip.mask, clip.w, clip.h, this.float.x, this.float.y);
    return 'ok';
  }

  private guard(): LiftResult {
    if (!this.mask) return 'none';
    return this.getDoc().drawBlockReason() ?? 'ok';
  }

  private transform(fn: (f: Floating) => Floating): LiftResult {
    const g = this.guard();
    if (g !== 'ok') return g;
    const r = this.lift();
    if (r !== 'ok' || !this.float) return r;
    this.float = fn(this.float);
    this.placed = null;
    return 'ok';
  }

  private clipFromFloating(f: Floating): Clip {
    return { pixels: f.pixels.slice(), mask: f.mask.slice(), w: f.w, h: f.h };
  }

  private clipFromCel(): Clip | null {
    const mask = this.mask;
    const b = mask?.bounds();
    if (!mask || !b) return null;
    const doc = this.getDoc();
    const cel = doc.cel(doc.activeId, doc.currentFrameId);
    const pixels = new Uint32Array(b.w * b.h);
    const cmask = new Uint8Array(b.w * b.h);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        if (!mask.contains(b.x + x, b.y + y)) continue;
        cmask[y * b.w + x] = 1;
        pixels[y * b.w + x] = cel?.[(b.y + y) * doc.width + b.x + x] ?? 0;
      }
    }
    return { pixels, mask: cmask, w: b.w, h: b.h };
  }

  reset(): void {
    const history = this.getHistory();
    if (history.strokeOpen) history.cancel();
    this.mask = null;
    this.float = null;
    this.placed = null;
  }
}
