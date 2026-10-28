import type { FrameData } from './frame';
import { cosSinDeg, type Vec2 } from './math';

export const MAX_SHEET_SIZE = 8192;

export interface SheetCell {
  animationIndex: number;
  frameIndex: number;
  x: number;
  y: number;
}

export interface SheetLayout {
  width: number;
  height: number;
  cells: SheetCell[];
}

export interface ExportOptions {
  animationIds: string[];
  scale: 1 | 2 | 3 | 4;
  padding: number;
  maxColumns: number;
}

/** Rotates interleaved x/y positions by `deg` (clockwise, y-down) around the origin; returns a new array. */
export function rotatePoints(positions: Float32Array, deg: number): Float32Array {
  const { cos, sin } = cosSinDeg(deg);
  const out = new Float32Array(positions.length);
  for (let i = 0; i + 1 < positions.length; i += 2) {
    const x = positions[i];
    const y = positions[i + 1];
    out[i] = x * cos - y * sin;
    out[i + 1] = x * sin + y * cos;
  }
  return out;
}

/**
 * Union of all item vertex positions in camera space (x scaled by `xScale` — -1 when the camera
 * mirrors, see render/view.ts — then rotated by the camera `rotation` around the origin),
 * rounded outwards to whole pixels, plus padding.
 */
export function computeExportBounds(
  frames: FrameData[],
  padding: number,
  rotation = 0,
  xScale = 1,
): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const { cos, sin } = cosSinDeg(rotation);
  for (const f of frames) {
    for (const item of f.items) {
      const p = item.positions;
      for (let i = 0; i + 1 < p.length; i += 2) {
        let x = xScale === 1 ? p[i] : Math.fround(p[i] * xScale);
        let y = p[i + 1];
        if (rotation !== 0) {
          // Rotated in place of rotatePoints (no copy); fround keeps its Float32 rounding.
          const px = x;
          x = Math.fround(px * cos - y * sin);
          y = Math.fround(px * sin + y * cos);
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) {
    minX = maxX = minY = maxY = 0;
  }
  const x = Math.floor(minX) - padding;
  const y = Math.floor(minY) - padding;
  return {
    x,
    y,
    w: Math.max(1, Math.ceil(maxX) + padding - x),
    h: Math.max(1, Math.ceil(maxY) + padding - y),
  };
}

export function layoutSheet(frameCounts: number[], frameW: number, frameH: number, maxColumns: number): SheetLayout {
  const cols = Math.max(1, Math.floor(maxColumns));
  const cells: SheetCell[] = [];
  let row = 0;
  let usedCols = 0;
  frameCounts.forEach((count, animationIndex) => {
    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      cells.push({
        animationIndex,
        frameIndex,
        x: (frameIndex % cols) * frameW,
        y: (row + Math.floor(frameIndex / cols)) * frameH,
      });
    }
    if (count > 0) {
      usedCols = Math.max(usedCols, Math.min(count, cols));
      row += Math.ceil(count / cols);
    }
  });
  return { width: usedCols * frameW, height: row * frameH, cells };
}

/** Checks the final sheet size in PNG pixels (already scaled) against MAX_SHEET_SIZE. */
export function checkSheetSize(width: number, height: number): string | null {
  const wideErr = width > MAX_SHEET_SIZE;
  const tallErr = height > MAX_SHEET_SIZE;
  if (!wideErr && !tallErr) return null;
  const hint =
    wideErr && tallErr
      ? 'Skalierung verringern.'
      : wideErr
        ? 'Skalierung verringern oder Spalten verringern.'
        : 'Skalierung verringern oder Spalten erhöhen.';
  return `Spritesheet wäre ${width}×${height} px – maximal ${MAX_SHEET_SIZE} px. ${hint}`;
}

export interface SheetPlan {
  /** Frame cell size in PNG pixels. */
  frameW: number;
  frameH: number;
  /** Cell positions and sheet size in PNG pixels. */
  layout: SheetLayout;
  /** Rig origin inside each frame cell, in PNG pixels. */
  pivot: Vec2;
}

/**
 * Plans the sheet entirely in PNG pixel coordinates for the given scale, so that the
 * rendered PNG and the exported metadata share the same numbers at every scale.
 */
export function planSheet(
  frameCounts: number[],
  bounds: { x: number; y: number; w: number; h: number },
  scale: number,
  maxColumns: number,
): SheetPlan {
  const frameW = bounds.w * scale;
  const frameH = bounds.h * scale;
  return {
    frameW,
    frameH,
    layout: layoutSheet(frameCounts, frameW, frameH, maxColumns),
    pivot: { x: -bounds.x * scale, y: -bounds.y * scale },
  };
}

/** Replaces characters invalid in Windows filenames; falls back to "spritesheet". */
export function sanitizeFileName(name: string): string {
  const clean = name.replace(/[\/:*?"<>|]/g, '_').trim();
  return clean === '' ? 'spritesheet' : clean;
}

/** Appends " (2)", " (3)" … to repeated names. */
export function uniqueNames(names: string[]): string[] {
  const used = new Set(names);
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    if (count === 1) return n;
    let k = count;
    let candidate = `${n} (${k})`;
    while (used.has(candidate)) candidate = `${n} (${++k})`;
    used.add(candidate);
    return candidate;
  });
}

export function buildSheetMetadata(args: {
  animations: { name: string; fps: number; frameCount: number }[];
  layout: SheetLayout;
  frameW: number;
  frameH: number;
  imageName: string;
  scale: number;
  pivot: Vec2;
}): object {
  const { animations, layout, frameW: w, frameH: h } = args;
  const frames: Record<string, unknown> = {};
  const frameTags: { name: string; from: number; to: number; direction: 'forward' }[] = [];
  let index = 0;
  const names = uniqueNames(animations.map((a) => a.name));
  // First cell per (animation, frame), like a linear find but without scanning all cells per frame.
  const cellAt = new Map<string, SheetCell>();
  for (const c of layout.cells) {
    const k = `${c.animationIndex}:${c.frameIndex}`;
    if (!cellAt.has(k)) cellAt.set(k, c);
  }
  animations.forEach((anim, animationIndex) => {
    const name = names[animationIndex];
    const from = index;
    const duration = Math.round(1000 / Math.max(1, anim.fps));
    for (let i = 0; i < anim.frameCount; i++) {
      const cell = cellAt.get(`${animationIndex}:${i}`);
      if (!cell) continue;
      frames[`${name} ${i}`] = {
        frame: { x: cell.x, y: cell.y, w, h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w, h },
        sourceSize: { w, h },
        duration,
      };
      index++;
    }
    frameTags.push({ name, from, to: index - 1, direction: 'forward' });
  });
  return {
    frames,
    meta: {
      app: 'rigsprite',
      version: '1',
      image: args.imageName,
      format: 'RGBA8888',
      size: { w: layout.width, h: layout.height },
      scale: String(args.scale),
      frameTags,
      pivot: args.pivot,
    },
  };
}
