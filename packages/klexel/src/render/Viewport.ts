import { PixelDocument, Color } from '../model/Document';
import { toCss } from '../palette/palettes';
import { edgeRuns, whiteEdges } from './edgeRuns';
import type { SelectionEdge } from '../model/Selection';
import type { Floating } from '../edit/SelectionSession';
import { HANDLE_CORNER_PX, HANDLE_BAR_LONG_PX, HANDLE_BAR_SHORT_PX, type HandleGeom } from '../edit/handles';

export class Viewport {
  zoom = 8;       // Bildschirmpixel pro Dokumentpixel
  panX = 0;       // Verschiebung in Bildschirmpixeln
  panY = 0;
  showGrid = true;
  preview: { points: Array<[number, number]>; color: Color } | null = null;
  /** Nachbarframes als Onion Skin (nur Anzeige, nie exportiert) */
  onion: { prev: Uint32Array | null; next: Uint32Array | null } | null = null;
  selectionOverlay: { edges: SelectionEdge[]; floating: Floating | null } | null = null;
  /** Griffe zum Skalieren der Auswahl und Größenanzeige (Bildschirmkoordinaten) */
  scaleHandles: HandleGeom[] | null = null;
  scaleLabel: { x: number; y: number; text: string } | null = null;
  /** Präzisionscursor (Dokumentzelle); draw = Modus Zeichnen */
  cursor: { x: number; y: number; draw: boolean } | null = null;
  selectionPreview:
    | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
    | { kind: 'path'; points: Array<[number, number]> }
    | null = null;
  private floatOff: { pixels: Uint32Array; canvas: HTMLCanvasElement } | null = null;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private onionOff: Record<'prev' | 'next', { canvas: HTMLCanvasElement; img: ImageData }>;

  constructor(private canvas: HTMLCanvasElement, private doc: PixelDocument) {
    this.off = document.createElement('canvas');
    this.off.width = doc.width; this.off.height = doc.height;
    this.offCtx = this.off.getContext('2d')!;
    this.img = this.offCtx.createImageData(doc.width, doc.height);
    const side = () => {
      const canvas = document.createElement('canvas');
      canvas.width = doc.width; canvas.height = doc.height;
      return { canvas, img: canvas.getContext('2d')!.createImageData(doc.width, doc.height) };
    };
    this.onionOff = { prev: side(), next: side() };
  }

  /** Nachbarframe einfärben, Alpha × 0.3 */
  private tint(side: 'prev' | 'next', pixels: Uint32Array, r: number, g: number, b: number): HTMLCanvasElement {
    const { canvas, img } = this.onionOff[side];
    const d = img.data;
    for (let i = 0; i < pixels.length; i++) {
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = Math.round((pixels[i] & 255) * 0.3);
    }
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    return canvas;
  }

  fit(): void {
    const r = this.canvas.getBoundingClientRect();
    this.zoom = Math.max(1, Math.floor(Math.min(r.width / this.doc.width, r.height / this.doc.height) * 0.95));
    this.panX = Math.round((r.width - this.doc.width * this.zoom) / 2);
    this.panY = Math.round((r.height - this.doc.height * this.zoom) / 2);
  }

  /** Bildschirm → Dokumentpixel (relativ zum Canvas). */
  toDoc(cx: number, cy: number): [number, number] {
    return [Math.floor((cx - this.panX) / this.zoom), Math.floor((cy - this.panY) / this.zoom)];
  }

  /** Zoomt um einen Fixpunkt (Canvas-Koordinaten) auf ein neues Maß. */
  zoomAt(cx: number, cy: number, newZoom: number): void {
    const z = Math.min(64, Math.max(1, newZoom));
    const dx = (cx - this.panX) / this.zoom, dy = (cy - this.panY) / this.zoom;
    this.zoom = z;
    this.panX = cx - dx * z; this.panY = cy - dy * z;
  }

  render(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.imageSmoothingEnabled = false;

    const { width, height } = this.doc;
    const data = this.doc.composite();
    const px = this.img.data;
    for (let i = 0; i < width * height; i++) {
      const c = data[i];
      px[i * 4] = c >>> 24; px[i * 4 + 1] = (c >>> 16) & 255; px[i * 4 + 2] = (c >>> 8) & 255; px[i * 4 + 3] = c & 255;
    }
    this.offCtx.putImageData(this.img, 0, 0);

    const x = this.panX, y = this.panY, W = width * this.zoom, H = height * this.zoom;
    // Schachbrett hinter transparenten Pixeln
    const cell = Math.max(this.zoom / 2, 4);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, W, H); ctx.clip();
    for (let yy = 0; yy * cell < H; yy++) for (let xx = 0; xx * cell < W; xx++) {
      ctx.fillStyle = (xx + yy) % 2 ? '#3a3a44' : '#2c2c34';
      ctx.fillRect(x + xx * cell, y + yy * cell, cell, cell);
    }
    ctx.restore();
    if (this.onion?.prev) ctx.drawImage(this.tint('prev', this.onion.prev, 255, 80, 80), x, y, W, H);
    if (this.onion?.next) ctx.drawImage(this.tint('next', this.onion.next, 80, 140, 255), x, y, W, H);
    ctx.drawImage(this.off, x, y, W, H);
    this.drawFloating(ctx, x, y);

    if (this.showGrid && this.zoom >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= width; i++) { ctx.moveTo(x + i * this.zoom + .5, y); ctx.lineTo(x + i * this.zoom + .5, y + H); }
      for (let j = 0; j <= height; j++) { ctx.moveTo(x, y + j * this.zoom + .5); ctx.lineTo(x + W, y + j * this.zoom + .5); }
      ctx.stroke();
    }
    if (this.preview) {
      // Vorschau liegt nur darüber, Dokument und History bleiben unberührt
      ctx.fillStyle = toCss(this.preview.color); ctx.globalAlpha = 0.75;
      for (const [px, py] of this.preview.points) {
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        ctx.fillRect(x + px * this.zoom, y + py * this.zoom, this.zoom, this.zoom);
      }
      ctx.globalAlpha = 1;
    }
    // Bewusst nach dem Raster: Rahmen und Vorschau bleiben unabgedunkelt lesbar
    this.drawOutline(ctx, x, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(x - .5, y - .5, W + 1, H + 1);
    this.drawScaleHandles(ctx);
    this.drawCursor(ctx, x, y);
  }

  /** Griffe der Auswahl: runde Ecken, abgerundete Balken in der Kantenmitte, weiß mit schwarzer Kontur */
  private drawScaleHandles(ctx: CanvasRenderingContext2D): void {
    for (const h of this.scaleHandles ?? []) {
      if (h.zone.w <= 0 || h.zone.h <= 0) continue;
      // Auf die Touchzone beschneiden: nie ins Auswahlrechteck hinein, auch am Rand der Fläche
      ctx.save();
      ctx.beginPath(); ctx.rect(h.zone.x, h.zone.y, h.zone.w, h.zone.h); ctx.clip();
      ctx.beginPath();
      if (h.kind === 'corner') ctx.arc(h.cx, h.cy, HANDLE_CORNER_PX / 2, 0, Math.PI * 2);
      else {
        const vertical = h.id === 'e' || h.id === 'w';
        const w = vertical ? HANDLE_BAR_SHORT_PX : HANDLE_BAR_LONG_PX, hh = vertical ? HANDLE_BAR_LONG_PX : HANDLE_BAR_SHORT_PX;
        ctx.roundRect(h.cx - w / 2, h.cy - hh / 2, w, hh, HANDLE_BAR_SHORT_PX / 2);
      }
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    const l = this.scaleLabel;
    if (l) {
      ctx.font = '600 14px system-ui, sans-serif';
      const w = ctx.measureText(l.text).width + 20;
      ctx.fillStyle = 'rgba(0,0,0,.85)';
      ctx.beginPath(); ctx.roundRect(l.x - w / 2, l.y - 14, w, 28, 14); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(l.text, l.x, l.y);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
  }

  /** Fadenkreuz um die Cursorzelle: weiß mit schwarzer Kontur, im Modus Zeichnen rot getönt */
  private drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const c = this.cursor;
    if (!c) return;
    const z = this.zoom, cx = x + c.x * z, cy = y + c.y * z, arm = z * 2.2, w = Math.max(2, z / 7);
    if (c.draw) { ctx.fillStyle = 'rgba(230,57,70,.5)'; ctx.fillRect(cx, cy, z, z); }
    for (const [col, lw] of [['#000', w + 2], [c.draw ? '#ff6b76' : '#fff', w]] as const) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.strokeRect(cx, cy, z, z);
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy + z / 2); ctx.lineTo(cx - z * .3, cy + z / 2);
      ctx.moveTo(cx + z * 1.3, cy + z / 2); ctx.lineTo(cx + z + arm, cy + z / 2);
      ctx.moveTo(cx + z / 2, cy - arm); ctx.lineTo(cx + z / 2, cy - z * .3);
      ctx.moveTo(cx + z / 2, cy + z * 1.3); ctx.lineTo(cx + z / 2, cy + z + arm);
      ctx.stroke();
    }
  }

  /** Schwebende Pixel (nur aus dem Cache neu gebaut, wenn sie sich ändern) */
  private floatCanvas(f: Floating): HTMLCanvasElement {
    if (!this.floatOff || this.floatOff.pixels !== f.pixels) {
      const canvas = document.createElement('canvas');
      canvas.width = f.w; canvas.height = f.h;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(f.w, f.h);
      for (let i = 0; i < f.w * f.h; i++) {
        const c = f.pixels[i];
        if (f.mask[i] === 0 || (c & 255) === 0) continue;
        img.data[i * 4] = c >>> 24; img.data[i * 4 + 1] = (c >>> 16) & 255;
        img.data[i * 4 + 2] = (c >>> 8) & 255; img.data[i * 4 + 3] = c & 255;
      }
      ctx.putImageData(img, 0, 0);
      this.floatOff = { pixels: f.pixels, canvas };
    }
    return this.floatOff.canvas;
  }

  private drawFloating(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const f = this.selectionOverlay?.floating;
    if (!f) return;
    const z = this.zoom;
    // Auf die Dokumentfläche beschneiden: Absetzen verwirft, was außerhalb liegt
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, this.doc.width * z, this.doc.height * z); ctx.clip();
    ctx.drawImage(this.floatCanvas(f), x + f.x * z, y + f.y * z, f.w * z, f.h * z);
    ctx.restore();
  }

  private drawOutline(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const z = this.zoom;
    const ov = this.selectionOverlay;
    const outline = (stroke: string, dash: number[]) => {
      ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.setLineDash(dash);
    };
    if (ov && ov.edges.length) {
      // Linienzüge statt Einzelkanten, damit das Strichmuster auch bei kleinem Zoom durchläuft
      ctx.beginPath();
      for (const r of edgeRuns(ov.edges)) {
        const sx = x + r.x * z + .5, sy = y + r.y * z + .5;
        ctx.moveTo(sx, sy);
        if (r.dir === 'h') ctx.lineTo(sx + r.len * z, sy); else ctx.lineTo(sx, sy + r.len * z);
      }
      outline('#000', []); ctx.stroke();
      // Weiß je Einzelkante nach Position (x + y gerade), unabhängig von Lauflänge und Zoom
      ctx.beginPath();
      for (const e of whiteEdges(ov.edges)) {
        const sx = x + e.x * z + .5, sy = y + e.y * z + .5;
        ctx.moveTo(sx, sy);
        if (e.dir === 'h') ctx.lineTo(sx + z, sy); else ctx.lineTo(sx, sy + z);
      }
      outline('#fff', []); ctx.stroke();
    }
    const p = this.selectionPreview;
    if (p && p.kind === 'path') {
      if (p.points.length) {
        // Pfad an den Pixelecken (wie die Polygon-Eckpunkte), im selben Raster wie der Rahmen; dünne Linie zurück zum Startpunkt zeigt das spätere Schließen
        const at = ([px, py]: [number, number]): [number, number] => [x + px * z + .5, y + py * z + .5];
        ctx.beginPath();
        p.points.forEach((pt, i) => { const [sx, sy] = at(pt); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
        outline('#000', []); ctx.stroke();
        outline('#fff', [4, 4]); ctx.stroke();
        if (p.points.length > 2) {
          const [ex, ey] = at(p.points[p.points.length - 1]), [bx, by] = at(p.points[0]);
          ctx.save();
          ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(bx, by);
          ctx.globalAlpha = 0.5; outline('#000', []); ctx.stroke(); outline('#fff', [4, 4]); ctx.stroke();
          ctx.restore();
        }
      }
    } else if (p) {
      const rx = x + Math.min(p.x0, p.x1) * z + .5, ry = y + Math.min(p.y0, p.y1) * z + .5;
      const rw = (Math.abs(p.x1 - p.x0) + 1) * z, rh = (Math.abs(p.y1 - p.y0) + 1) * z;
      outline('#000', []); ctx.strokeRect(rx, ry, rw, rh);
      outline('#fff', [4, 4]); ctx.strokeRect(rx, ry, rw, rh);
    }
    ctx.setLineDash([]);
  }
}
