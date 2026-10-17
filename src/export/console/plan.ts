import type { Color } from '../../model/Document';
import { reducePixels, TARGET_PALETTE, type ConsoleTarget } from './reduce';

export type ExportMode = 'slice' | 'frames';
export interface ExportFrame { pixels: Uint32Array; width: number; height: number }
export interface ExportOptions { target: ConsoleTarget; mode: ExportMode; cell: number; start: number; truncate: boolean }
export interface PlanSprite { index: number; w: number; h: number; indices: Uint8Array; mapped: Uint32Array; original: Uint32Array }
export interface PlanIssue { kind: 'count' | 'crop' | 'empty'; message: string }
export interface ExportPlan { sprites: PlanSprite[]; adjusted: number; issues: PlanIssue[]; dropped: number; blocked: boolean }

const MAX_INDEX = 255;
const PICO8_SHEET_CELLS = 16; // Zellen je Blattzeile (128 / 8)

/** Zeichnet sich ein reduziertes Bild mit den zugehörigen Originalpixeln. */
interface Img { w: number; h: number; indices: Uint8Array; mapped: Uint32Array; original: Uint32Array }

/** Schneidet ein size×size-Feld ab (x0, y0); was außerhalb des Bildes liegt, bleibt durchsichtig. */
function cut(img: Img, x0: number, y0: number, size: number, index: number): PlanSprite {
  const n = size * size;
  const s: PlanSprite = { index, w: size, h: size, indices: new Uint8Array(n), mapped: new Uint32Array(n), original: new Uint32Array(n) };
  for (let y = 0; y < size; y++) {
    const sy = y0 + y;
    if (sy >= img.h) break;
    for (let x = 0; x < size; x++) {
      const sx = x0 + x;
      if (sx >= img.w) break;
      const from = sy * img.w + sx, to = y * size + x;
      s.indices[to] = img.indices[from]; s.mapped[to] = img.mapped[from]; s.original[to] = img.original[from];
    }
  }
  return s;
}

/** Vorgabe der Spritegröße im Dialog: PICO-8 fest 8, Picotron nach Frame-Größe (8/16/32). */
export function defaultCell(target: ConsoleTarget, frames: ExportFrame[]): number {
  if (target === 'pico8') return 8;
  const m = Math.max(frames[0]?.width ?? 0, frames[0]?.height ?? 0);
  return m <= 8 ? 8 : m <= 16 ? 16 : 32;
}

export function buildExportPlan(frames: ExportFrame[], opts: ExportOptions): ExportPlan {
  const palette = TARGET_PALETTE[opts.target];
  const cell = opts.target === 'pico8' ? 8 : opts.cell;
  const start = Number.isFinite(opts.start) ? Math.min(MAX_INDEX + 1, Math.max(0, Math.floor(opts.start))) : 1;
  const adjustedColors = new Set<Color>();
  const issues: PlanIssue[] = [];

  const toImg = (f: ExportFrame): Img => {
    const r = reducePixels(f.pixels, palette);
    r.adjusted.forEach(c => adjustedColors.add(c));
    return { w: f.width, h: f.height, indices: r.indices, mapped: r.mapped, original: f.pixels };
  };

  const all: PlanSprite[] = [];
  if (frames.length > 0 && opts.mode === 'slice') {
    const img = toImg(frames[0]);
    const cols = Math.ceil(img.w / cell), rows = Math.ceil(img.h / cell);
    for (let k = 0; k < cols * rows; k++) all.push(cut(img, (k % cols) * cell, Math.floor(k / cols) * cell, cell, start + k));
  } else if (frames.length > 0 && opts.target === 'picotron') {
    const tooBig = frames[0].width > cell || frames[0].height > cell;
    if (tooBig) issues.push({ kind: 'crop', message: `Die Frames (${frames[0].width}×${frames[0].height}) sind größer als die Spritegröße ${cell}×${cell}.` });
    frames.forEach((f, k) => all.push(cut(toImg(f), 0, 0, cell, start + k)));
  } else if (frames.length > 0) {
    const fw = frames[0].width, fh = frames[0].height;
    const bw = Math.min(PICO8_SHEET_CELLS, Math.ceil(fw / 8)), bh = Math.min(PICO8_SHEET_CELLS, Math.ceil(fh / 8));
    if (fw > 128 || fh > 128) issues.push({ kind: 'crop', message: `Die Frames (${fw}×${fh}) sind größer als das PICO-8-Sprite-Blatt (128×128).` });
    if (bw === 1 && bh === 1) {
      frames.forEach((f, k) => all.push(cut(toImg(f), 0, 0, 8, start + k)));
    } else {
      // Blöcke nacheinander ab der Startnummer; passt ein Block nicht mehr in die Zeile, beginnt die nächste Blockzeile
      let col = start % PICO8_SHEET_CELLS, row = Math.floor(start / PICO8_SHEET_CELLS);
      for (const f of frames) {
        if (col + bw > PICO8_SHEET_CELLS) { col = 0; row += bh; }
        const img = toImg(f), top = row * PICO8_SHEET_CELLS + col;
        for (let cy = 0; cy < bh; cy++) for (let cx = 0; cx < bw; cx++) {
          all.push(cut(img, cx * 8, cy * 8, 8, top + cy * PICO8_SHEET_CELLS + cx));
        }
        col += bw;
      }
    }
  }

  const valid = all.filter(s => s.index <= MAX_INDEX);
  const dropped = all.length - valid.length;
  if (all.length > 0 && valid.length === 0) {
    issues.push({ kind: 'empty', message: `Ab Sprite ${start} ist kein Platz mehr (höchste Nummer ist ${MAX_INDEX}).` });
  } else if (dropped > 0) {
    issues.push({ kind: 'count', message: `Es sind ${all.length} Sprites ab Nummer ${start}, aber nur ${valid.length} passen (höchste Nummer ${MAX_INDEX}).` });
  }

  const blocked = issues.some(i => i.kind === 'empty') || (issues.length > 0 && !opts.truncate);
  return {
    sprites: opts.truncate ? valid : all,
    adjusted: adjustedColors.size,
    issues,
    dropped: opts.truncate ? dropped : 0,
    blocked,
  };
}
