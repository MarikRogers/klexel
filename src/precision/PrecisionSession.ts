import type { Color } from '../model/Document';
import type { Pt } from '../draw/pixelPerfect';
import { TapDetector } from './tapDetector';

export type PrecisionTool = 'pen' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'ellipse';
export type Mode = 'move' | 'draw';

/** Wirkungen der Session auf die App; die App liefert die Umsetzung (History, Füllen, Formen, Hinweise). */
export interface Effects {
  /** true (und zeigt selbst den Hinweis), wenn die aktive Ebene gesperrt oder ausgeblendet ist */
  blocked(): boolean;
  strokeBegin(): void;
  strokePoint(x: number, y: number): void;
  strokeEnd(commit: boolean): void;
  fill(x: number, y: number): void;
  pick(x: number, y: number): void;
  shapePreview(a: Pt, b: Pt): void;
  shapeCommit(): void;
  shapeCancel(): void;
  /** macht den neuesten Undo-Schritt rückgängig und verwirft ihn */
  dropLast(): void;
  getColor(): Color;
  setColor(c: Color): void;
  say(text: string): void;
  changed(): void;
}

const TOOLS: readonly string[] = ['pen', 'eraser', 'fill', 'picker', 'line', 'rect', 'ellipse'];
const isFreehand = (t: PrecisionTool | null) => t === 'pen' || t === 'eraser';
const isShape = (t: PrecisionTool | null) => t === 'line' || t === 'rect' || t === 'ellipse';

/**
 * Bedienlogik des Präzisionscursors ohne DOM: Cursor, Modus Bewegen/Zeichnen, Tipp und Doppeltipp.
 * `map` rechnet eine Bildschirmposition (Canvas-lokal) in die Cursorzelle um.
 */
export class PrecisionSession {
  cursor: Pt = [0, 0];
  mode: Mode = 'move';

  private tool: PrecisionTool | null = null;
  private taps = new TapDetector();
  private touching = false;
  private stroking = false;
  private dragged = false;
  private startCell: Pt = [0, 0];
  private anchor: Pt | null = null;
  private undoTap: (() => void) | null = null;

  constructor(private fx: Effects, private map: (sx: number, sy: number) => Pt) {}

  get active(): boolean { return this.tool !== null; }

  setTool(t: string): void {
    const next = TOOLS.includes(t) ? (t as PrecisionTool) : null;
    if (next === this.tool) return;
    const crossesShape = isShape(this.tool) || isShape(next);
    if (next === null) this.cancel();
    else if (crossesShape) {
      this.cancel();
      this.mode = 'move';
    }
    this.undoTap = null;
    this.tool = next;
    this.fx.changed();
  }

  reset(center: Pt): void {
    this.cancel();
    this.cursor = [center[0], center[1]];
    this.mode = 'move';
    this.fx.changed();
  }

  setMode(m: Mode): void {
    if (m === this.mode) return;
    if (isShape(this.tool)) {
      if (m === 'draw') {
        if (this.fx.blocked()) return;
        this.anchor = [this.cursor[0], this.cursor[1]];
        this.fx.shapePreview(this.anchor, this.cursor);
      } else if (this.anchor) {
        if (this.fx.blocked()) this.fx.shapeCancel(); else this.fx.shapeCommit();
        this.anchor = null;
      }
    }
    this.mode = m;
    this.fx.say(m === 'draw' ? 'Zeichenmodus AN' : 'Zeichenmodus AUS');
    this.fx.changed();
  }

  down(sx: number, sy: number, t: number): void {
    if (!this.active) return;
    this.touching = true; this.dragged = false; this.stroking = false;
    this.cursor = this.map(sx, sy);
    this.startCell = [this.cursor[0], this.cursor[1]];
    this.taps.down(sx, sy, t);
    if (this.mode === 'draw') {
      if (isFreehand(this.tool) && !this.fx.blocked()) { this.fx.strokeBegin(); this.stroking = true; }
      else if (this.anchor) this.fx.shapePreview(this.anchor, this.cursor);
    }
    this.fx.changed();
  }

  move(sx: number, sy: number): void {
    if (!this.active || !this.touching) return;
    this.cursor = this.map(sx, sy);
    const was = this.dragged;
    this.dragged = this.taps.move(sx, sy);
    if (this.mode === 'draw') {
      if (this.stroking && this.dragged) {
        if (!was) this.fx.strokePoint(this.startCell[0], this.startCell[1]);
        this.fx.strokePoint(this.cursor[0], this.cursor[1]);
      } else if (this.anchor) {
        this.fx.shapePreview(this.anchor, this.cursor);
      }
    }
    this.fx.changed();
  }

  up(sx: number, sy: number, t: number): void {
    if (!this.active || !this.touching) return;
    this.touching = false;
    const kind = this.taps.up(sx, sy, t);
    const undoPrev = this.undoTap;
    this.undoTap = null;
    if (kind === 'doubleTap') {
      if (this.stroking) { this.fx.strokeEnd(false); this.stroking = false; }
      undoPrev?.();
      this.setMode(this.mode === 'draw' ? 'move' : 'draw');
    } else if (this.mode === 'draw') {
      this.finishTouch(kind === 'tap');
    }
    this.fx.changed();
  }

  /** Zweiter Finger, Abbruch oder Ausschalten: Strich und Vorschau verwerfen, Cursor bleibt stehen. */
  cancel(): void {
    this.touching = false; this.taps.cancel(); this.undoTap = null;
    if (this.stroking) { this.fx.strokeEnd(false); this.stroking = false; }
    if (this.anchor) { this.fx.shapeCancel(); this.anchor = null; this.mode = 'move'; }
    this.fx.changed();
  }

  /** Abheben im Modus Zeichnen: Strich beenden bzw. Füllen/Pipette auslösen. */
  private finishTouch(isTap: boolean): void {
    const [x, y] = this.cursor;
    if (isFreehand(this.tool)) {
      if (!this.stroking) return;
      if (!this.dragged) this.fx.strokePoint(x, y); // Tipp oder langes Halten: ein Pixel am Cursor
      this.fx.strokeEnd(true);
      this.stroking = false;
      if (isTap) this.undoTap = () => this.fx.dropLast();
    } else if (this.tool === 'fill') {
      if (this.fx.blocked()) return;
      this.fx.fill(x, y);
      if (isTap) this.undoTap = () => this.fx.dropLast();
    } else if (this.tool === 'picker') {
      const prev = this.fx.getColor();
      this.fx.pick(x, y);
      if (isTap) this.undoTap = () => this.fx.setColor(prev);
    }
  }
}
