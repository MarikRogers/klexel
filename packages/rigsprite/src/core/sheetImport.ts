import { INVALID_JSON } from './messages';

export interface SheetRect {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GridOptions =
  | { mode: 'count'; cols: number; rows: number; margin?: number; spacing?: number }
  | { mode: 'size'; cellW: number; cellH: number; margin?: number; spacing?: number };

export const MAX_IMPORT_CELLS = 1024;
export const TOO_MANY_CELLS = `Zu viele Zellen (max. ${MAX_IMPORT_CELLS})`;

/** Number of cells the options ask for (arithmetic only, no allocation); 0 for invalid options. */
export function gridCellCount(imageW: number, imageH: number, opts: GridOptions): number {
  return gridDims(imageW, imageH, opts)?.count ?? 0;
}

function gridDims(imageW: number, imageH: number, opts: GridOptions) {
  const margin = opts.margin ?? 0;
  const spacing = opts.spacing ?? 0;
  if (!(margin >= 0) || !(spacing >= 0)) return null;
  let cols: number;
  let rows: number;
  let cellW: number;
  let cellH: number;
  if (opts.mode === 'count') {
    if (!(opts.cols > 0) || !(opts.rows > 0)) return null;
    cols = Math.floor(opts.cols);
    rows = Math.floor(opts.rows);
    if (cols * rows > MAX_IMPORT_CELLS) return { cols, rows, cellW: 0, cellH: 0, margin, spacing, count: cols * rows };
    cellW = Math.floor((imageW - 2 * margin - (cols - 1) * spacing) / cols);
    cellH = Math.floor((imageH - 2 * margin - (rows - 1) * spacing) / rows);
  } else {
    if (!(opts.cellW > 0) || !(opts.cellH > 0)) return null;
    cellW = Math.floor(opts.cellW);
    cellH = Math.floor(opts.cellH);
    cols = Math.floor((imageW - 2 * margin + spacing) / (cellW + spacing));
    rows = Math.floor((imageH - 2 * margin + spacing) / (cellH + spacing));
  }
  if (cellW <= 0 || cellH <= 0 || cols <= 0 || rows <= 0) return null;
  return { cols, rows, cellW, cellH, margin, spacing, count: cols * rows };
}

export function gridRects(imageW: number, imageH: number, opts: GridOptions, baseName: string): SheetRect[] {
  const d = gridDims(imageW, imageH, opts);
  if (!d || d.count > MAX_IMPORT_CELLS || d.count === 0 || d.cellW <= 0) return [];
  const { cols, rows, cellW, cellH, margin, spacing } = d;
  const rects: SheetRect[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = margin + c * (cellW + spacing);
      const y = margin + r * (cellH + spacing);
      if (x + cellW > imageW || y + cellH > imageH) continue;
      rects.push({ name: `${baseName}_${i++}`, x, y, w: cellW, h: cellH });
    }
  }
  return rects;
}

function baseOf(filename: string): string {
  const file = filename.split(/[\\/]/).pop() ?? filename;
  const dot = file.lastIndexOf('.');
  const base = dot > 0 ? file.slice(0, dot) : dot === 0 ? '' : file;
  return base || 'sprite';
}

function isNumRect(v: unknown): v is { x: number; y: number; w: number; h: number } {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return ['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number');
}

function isValidRect(r: { x: number; y: number; w: number; h: number }): boolean {
  return (
    Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.w) && Number.isInteger(r.h) &&
    r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1
  );
}

export function parseAtlas(
  text: string,
): { ok: true; rects: SheetRect[]; skipped: number; imageName?: string } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: INVALID_JSON };
  }
  const unknownFormat = { ok: false as const, error: 'Unbekanntes Atlas-Format' };
  if (!data || typeof data !== 'object') return unknownFormat;
  const frames = (data as Record<string, unknown>).frames;
  if (!frames || typeof frames !== 'object') return unknownFormat;
  const entries: [string, unknown][] = Array.isArray(frames)
    ? frames.map((f): [string, unknown] => {
        const fn = f && typeof f === 'object' ? (f as Record<string, unknown>).filename : undefined;
        return [typeof fn === 'string' ? fn : '', f];
      })
    : Object.entries(frames);
  if (entries.length > MAX_IMPORT_CELLS) return { ok: false, error: TOO_MANY_CELLS };
  const rects: SheetRect[] = [];
  let skipped = 0;
  for (const [key, f] of entries) {
    if (!f || typeof f !== 'object' || !key) return unknownFormat;
    const fr = f as Record<string, unknown>;
    if (fr.rotated === true) return { ok: false, error: 'Gedrehte Frames werden nicht unterstützt' };
    if (!isNumRect(fr.frame)) return unknownFormat;
    if (!isValidRect(fr.frame)) {
      skipped++;
      continue;
    }
    const { x, y, w, h } = fr.frame;
    rects.push({ name: baseOf(key), x, y, w, h });
  }
  if (rects.length === 0 && skipped === 0) return unknownFormat;
  const meta = (data as Record<string, unknown>).meta;
  const image = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).image : undefined;
  return typeof image === 'string' ? { ok: true, rects, skipped, imageName: image } : { ok: true, rects, skipped };
}

/** Makes names unique within one import by suffixing "_2", "_3", ... */
export function dedupeNames(rects: SheetRect[]): SheetRect[] {
  const seen = new Map<string, number>();
  const used = new Set(rects.map((r) => r.name));
  return rects.map((r) => {
    const n = (seen.get(r.name) ?? 0) + 1;
    seen.set(r.name, n);
    if (n === 1) return r;
    let k = n;
    while (used.has(`${r.name}_${k}`)) k++;
    seen.set(r.name, k);
    used.add(`${r.name}_${k}`);
    return { ...r, name: `${r.name}_${k}` };
  });
}
