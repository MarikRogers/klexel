import type { DecodedImage } from '../share/linkCodec';

/** Zeichnet ein Bild 1:1 in ein Canvas (Vergrößern übernimmt CSS mit `image-rendering: pixelated`). */
export function drawDecoded(canvas: HTMLCanvasElement, img: DecodedImage): void {
  canvas.width = img.width; canvas.height = img.height;
  canvas.style.aspectRatio = `${img.width} / ${img.height}`;
  const ctx = canvas.getContext('2d')!;
  const id = ctx.createImageData(img.width, img.height);
  for (let i = 0; i < img.pixels.length; i++) {
    const v = img.pixels[i];
    id.data[i * 4] = v >>> 24; id.data[i * 4 + 1] = (v >>> 16) & 255; id.data[i * 4 + 2] = (v >>> 8) & 255; id.data[i * 4 + 3] = v & 255;
  }
  ctx.putImageData(id, 0, 0);
}
