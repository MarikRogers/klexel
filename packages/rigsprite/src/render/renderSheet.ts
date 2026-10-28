import {
  buildSheetMetadata,
  checkSheetSize,
  computeExportBounds,
  planSheet,
  sanitizeFileName,
  type ExportOptions,
} from '../core/export';
import { buildFrame, type FrameData } from '../core/frame';
import { animationFrames, rgbaToPacked } from '../core/animationFrames';
import { toFrameInput, type Project } from '../core/project';
import { CANVAS_UNSUPPORTED, errorMessage, NO_ANIMATION_SELECTED } from '../core/messages';
import { loadImageElement } from '../dom/imageIo';
import { orderLayers } from './layers';
import { SkinRenderer } from './SkinRenderer';

export type SheetResult = { ok: true; png: Blob; json: string } | { ok: false; error: string };

function domCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Plain 2D canvas for the sheet (no GL context involved). */
function makeSheetCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : domCanvas(w, h);
}

/** One GL canvas + renderer; falls back to a DOM canvas if the OffscreenCanvas cannot provide WebGL2. */
function makeRenderer(w: number, h: number): { canvas: HTMLCanvasElement | OffscreenCanvas; renderer: SkinRenderer } {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const canvas = new OffscreenCanvas(w, h);
      return { canvas, renderer: new SkinRenderer(canvas) };
    } catch {
      // fall through to a DOM canvas
    }
  }
  const canvas = domCanvas(w, h);
  return { canvas, renderer: new SkinRenderer(canvas) };
}

/** GL-Renderer der Frame-Größe mit allen Bildern des Projekts (gemeinsam für Spritesheet und Rückgabe). */
async function prepareRenderer(
  project: Project,
  fw: number,
  fh: number,
): Promise<{ canvas: HTMLCanvasElement | OffscreenCanvas; renderer: SkinRenderer }> {
  const made = makeRenderer(fw, fh);
  try {
    const loaded = await Promise.all(
      Object.values(project.images).map(async (asset) => [asset.id, await loadImageElement(asset.dataUrl)] as const),
    );
    for (const [id, img] of loaded) made.renderer.setImage(id, img, project.settings.pixelArt);
  } catch (e) {
    made.renderer.dispose(true);
    throw e;
  }
  return made;
}

/** Flache Frontansicht des Exports: der Rig-Ursprung liegt auf dem Pivot jeder Zelle. */
function exportView(project: Project, pivot: { x: number; y: number }, fw: number, fh: number, scale: number) {
  const { cameraRotation: rotation, mirror } = project.settings;
  return {
    x: pivot.x - fw / 2,
    y: pivot.y - fh / 2,
    zoom: scale,
    rotation,
    yaw: 0,
    pitch: 0,
    mirror,
    width: fw,
    height: fh,
  };
}

async function canvasToPng(c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG konnte nicht erzeugt werden.'))), 'image/png'),
  );
}

export async function renderSpritesheet(project: Project, opts: ExportOptions): Promise<SheetResult> {
  try {
    const anims = project.animations.filter((a) => opts.animationIds.includes(a.id));
    if (anims.length === 0) return { ok: false, error: NO_ANIMATION_SELECTED };

    const framesPerAnim: FrameData[][] = anims.map((a) => {
      const input = toFrameInput(project, a.id);
      const count = Math.max(1, a.length);
      return Array.from({ length: count }, (_, i) => buildFrame(input, i));
    });
    const { cameraRotation: rotation, mirror } = project.settings;
    // Bounds in camera space (mirror, then roll) — the same mapping the GL view below applies (front
    // view: no orbit, no layer depth); the rig origin (rotation centre) lands on the pivot of each cell.
    const bounds = computeExportBounds(framesPerAnim.flat(), opts.padding, rotation, mirror ? -1 : 1);
    const { scale } = opts;
    // All sheet geometry is in PNG pixels; the metadata below uses the very same plan.
    const plan = planSheet(framesPerAnim.map((f) => f.length), bounds, scale, opts.maxColumns);
    const { layout, frameW: fw, frameH: fh, pivot } = plan;
    const sizeError = checkSheetSize(layout.width, layout.height);
    if (sizeError) return { ok: false, error: sizeError };

    const sheet = makeSheetCanvas(layout.width, layout.height);
    const ctx = sheet.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return { ok: false, error: CANVAS_UNSUPPORTED };
    ctx.imageSmoothingEnabled = !project.settings.pixelArt;

    const { canvas: glCanvas, renderer } = await prepareRenderer(project, fw, fh);
    try {
      const view = exportView(project, pivot, fw, fh, scale);
      for (const cell of layout.cells) {
        const frame = framesPerAnim[cell.animationIndex][cell.frameIndex];
        // Export is always the flat front view: every item on depth 0.
        renderer.render(orderLayers(frame.items, view, 0), view, null);
        ctx.drawImage(glCanvas as CanvasImageSource, cell.x, cell.y);
      }
    } finally {
      renderer.dispose(true);
    }

    const png = await canvasToPng(sheet);
    const json = JSON.stringify(
      buildSheetMetadata({
        animations: anims.map((a, i) => ({ name: a.name, fps: a.fps, frameCount: framesPerAnim[i].length })),
        layout,
        frameW: fw,
        frameH: fh,
        imageName: `${sanitizeFileName(project.name)}.png`,
        scale,
        pivot,
      }),
      null,
      2,
    );
    return { ok: true, png, json };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export type AnimationFramesResult =
  | { ok: true; width: number; height: number; fps: number; name: string; frames: Uint32Array[] }
  | { ok: false; error: string };

/**
 * Rendert die Frames from..to (inklusiv, 0-basiert; Standard: alle) einer Animation als Pixel (0xRRGGBBAA, Zeilen
 * von oben) für die Rückgabe an Klexel: dieselbe Kamera, Grenzen und derselbe Pivot wie der Spritesheet-Export
 * (Maßstab 1, ohne Padding), einheitliche Größe für alle Frames (animationFrameSize liefert sie vorab).
 */
export async function renderAnimationFrames(
  project: Project,
  animationId: string,
  range?: { from: number; to: number },
): Promise<AnimationFramesResult> {
  try {
    const anim = animationFrames(project, animationId);
    if (!anim) return { ok: false, error: NO_ANIMATION_SELECTED };
    const from = Math.max(0, range?.from ?? 0);
    const to = Math.min(anim.frames.length - 1, range?.to ?? anim.frames.length - 1);
    const { width: fw, height: fh, pivot } = anim;

    // Auslesen über ein 2D-Canvas (getImageData: Zeilen von oben, nicht vormultipliziert) wie beim Zeichnen ins Sheet
    const read = makeSheetCanvas(fw, fh);
    const ctx = read.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return { ok: false, error: CANVAS_UNSUPPORTED };

    const { canvas: glCanvas, renderer } = await prepareRenderer(project, fw, fh);
    const frames: Uint32Array[] = [];
    try {
      const view = exportView(project, pivot, fw, fh, 1);
      for (let i = from; i <= to; i++) {
        renderer.render(orderLayers(anim.frames[i].items, view, 0), view, null);
        ctx.clearRect(0, 0, fw, fh);
        ctx.drawImage(glCanvas as CanvasImageSource, 0, 0);
        frames.push(rgbaToPacked(ctx.getImageData(0, 0, fw, fh).data, fw, fh));
      }
    } finally {
      renderer.dispose(true);
    }
    return { ok: true, width: fw, height: fh, fps: anim.fps, name: anim.name, frames };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
