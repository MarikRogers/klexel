const THUMB = 24;

/** Zeichnet ein 24x24-Vorschaubild (Pixel als 0xRRGGBBAA, Schachbrett dahinter); undefined = leer. */
export function drawThumb(canvas: HTMLCanvasElement, pixels: Uint32Array | undefined, w: number, h: number): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, THUMB, THUMB);
  for (let y = 0; y < THUMB; y += 4) {
    for (let x = 0; x < THUMB; x += 4) {
      ctx.fillStyle = ((x + y) / 4) % 2 ? '#bbb' : '#888';
      ctx.fillRect(x, y, 4, 4);
    }
  }
  if (!pixels) return;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const img = new ImageData(w, h);
  const px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i];
    // 0xRRGGBBAA -> little-endian 0xAABBGGRR
    px[i] = (((c & 255) << 24) | (((c >>> 8) & 255) << 16) | (((c >>> 16) & 255) << 8) | (c >>> 24)) >>> 0;
  }
  src.getContext('2d')!.putImageData(img, 0, 0);
  const s = Math.min(THUMB / w, THUMB / h);
  const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, Math.floor((THUMB - dw) / 2), Math.floor((THUMB - dh) / 2), dw, dh);
}
