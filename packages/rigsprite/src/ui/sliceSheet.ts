import { newId } from '../core/id';
import { CANVAS_UNSUPPORTED, unsupportedImage } from '../core/messages';
import type { ImageAsset } from '../core/part';
import { loadImageElement, readDataUrl } from '../dom/imageIo';
import type { SheetRect } from '../core/sheetImport';

export async function sliceSheet(img: HTMLImageElement, rects: SheetRect[], skipEmpty: boolean): Promise<ImageAsset[]> {
  const out: ImageAsset[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error(CANVAS_UNSUPPORTED);
  for (const r of rects) {
    canvas.width = r.w; // also clears the canvas
    canvas.height = r.h;
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    if (skipEmpty) {
      const d = ctx.getImageData(0, 0, r.w, r.h).data;
      let empty = true;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] !== 0) {
          empty = false;
          break;
        }
      }
      if (empty) continue;
    }
    out.push({
      id: newId(),
      name: `${r.name}.png`,
      dataUrl: canvas.toDataURL('image/png'),
      width: r.w,
      height: r.h,
    });
  }
  return out;
}

export async function loadSheetImage(file: File): Promise<HTMLImageElement> {
  try {
    return await loadImageElement(await readDataUrl(file));
  } catch {
    throw new Error(unsupportedImage(file.name));
  }
}

/** Draws the sheet at its natural size onto `canvas` with an outline per cell. */
export function drawSheetPreview(canvas: HTMLCanvasElement, img: HTMLImageElement, rects: SheetRect[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  ctx.strokeStyle = '#ff3b6b';
  ctx.lineWidth = 1;
  for (const r of rects) ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}
