import { PixelDocument, Color } from '../model/Document';
import { toCss } from '../palette/palettes';

export class Viewport {
  zoom = 8;       // Bildschirmpixel pro Dokumentpixel
  panX = 0;       // Verschiebung in Bildschirmpixeln
  panY = 0;
  showGrid = true;
  preview: { points: Array<[number, number]>; color: Color } | null = null;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private img: ImageData;

  constructor(private canvas: HTMLCanvasElement, private doc: PixelDocument) {
    this.off = document.createElement('canvas');
    this.off.width = doc.width; this.off.height = doc.height;
    this.offCtx = this.off.getContext('2d')!;
    this.img = this.offCtx.createImageData(doc.width, doc.height);
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

    const { width, height, data } = this.doc;
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
    ctx.drawImage(this.off, x, y, W, H);

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
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.strokeRect(x - .5, y - .5, W + 1, H + 1);
  }
}
