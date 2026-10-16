import type { PixelDocument } from '../model/Document';

export type SheetMode = 'row' | 'column' | 'grid';

export function sheetLayout(
  count: number, frameW: number, frameH: number, mode: SheetMode, columns?: number,
): { cols: number; rows: number; width: number; height: number; positions: Array<{ x: number; y: number }> } {
  count = Math.max(0, Math.floor(count) || 0);
  let cols: number;
  if (mode === 'row') cols = Math.max(count, 1);
  else if (mode === 'column') cols = 1;
  else {
    const c = Number.isFinite(columns) ? Math.floor(columns!) : Math.ceil(Math.sqrt(count));
    cols = Math.min(Math.max(c, 1), Math.max(count, 1));
  }
  const rows = Math.ceil(count / cols);
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) positions.push({ x: (i % cols) * frameW, y: Math.floor(i / cols) * frameH });
  return { cols, rows, width: cols * frameW, height: rows * frameH, positions };
}

const MAX_SIDE = 32767;
const MAX_AREA = 268_000_000;

/** Übersteigt das Blatt die Canvas-Grenzen des Browsers? */
export function sheetTooLarge(layout: { width: number; height: number }, scale: number): boolean {
  const w = layout.width * scale, h = layout.height * scale;
  return w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_AREA;
}

function frameCanvas(doc: PixelDocument, frameId: number): HTMLCanvasElement {
  const small = document.createElement('canvas');
  small.width = doc.width; small.height = doc.height;
  const ctx = small.getContext('2d')!;
  const id = ctx.createImageData(doc.width, doc.height);
  const pixels = doc.compositeFrame(frameId);
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    id.data[i * 4] = v >>> 24; id.data[i * 4 + 1] = (v >>> 16) & 255; id.data[i * 4 + 2] = (v >>> 8) & 255; id.data[i * 4 + 3] = v & 255;
  }
  ctx.putImageData(id, 0, 0);
  return small;
}

function toPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG fehlgeschlagen'))), 'image/png'));
}

export async function renderSheet(
  doc: PixelDocument, mode: SheetMode, columns: number | undefined, scale: number,
): Promise<Blob> {
  const l = sheetLayout(doc.frames.length, doc.width, doc.height, mode, columns);
  const c = document.createElement('canvas');
  c.width = l.width * scale; c.height = l.height * scale;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  doc.frames.forEach((f, i) => {
    ctx.drawImage(frameCanvas(doc, f.id), l.positions[i].x * scale, l.positions[i].y * scale, doc.width * scale, doc.height * scale);
  });
  return toPng(c);
}

export async function frameFiles(doc: PixelDocument, scale: number): Promise<Array<{ name: string; data: Uint8Array }>> {
  const out: Array<{ name: string; data: Uint8Array }> = [];
  for (let i = 0; i < doc.frames.length; i++) {
    const c = document.createElement('canvas');
    c.width = doc.width * scale; c.height = doc.height * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frameCanvas(doc, doc.frames[i].id), 0, 0, c.width, c.height);
    const blob = await toPng(c);
    out.push({ name: `frame-${String(i + 1).padStart(3, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  return out;
}
