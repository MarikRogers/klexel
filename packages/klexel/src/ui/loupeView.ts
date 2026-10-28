import type { Color } from '../model/Document';
import { LOUPE_CELLS, LOUPE_PX, LOUPE_SIZE } from '../precision/loupe';

export interface LoupeView {
  update(cells: Array<Color | null>, draw: boolean, side: 'left' | 'right'): void;
  hide(): void;
}

/** Lupe als eigenes Canvas über der Zeichenfläche; fängt keine Berührungen ab. */
export function createLoupe(stage: HTMLElement): LoupeView {
  const canvas = document.createElement('canvas');
  canvas.className = 'loupe';
  canvas.hidden = true;
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const mid = (LOUPE_CELLS - 1) / 2;

  function update(cells: Array<Color | null>, draw: boolean, side: 'left' | 'right'): void {
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(LOUPE_SIZE * dpr);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    canvas.hidden = false;
    canvas.classList.toggle('right', side === 'right');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    cells.forEach((c, i) => {
      const x = (i % LOUPE_CELLS) * LOUPE_PX, y = Math.floor(i / LOUPE_CELLS) * LOUPE_PX;
      if (c === null) { ctx.fillStyle = '#0c0d10'; ctx.fillRect(x, y, LOUPE_PX, LOUPE_PX); return; }
      ctx.fillStyle = ((x + y) / LOUPE_PX) % 2 ? '#3a3a44' : '#2c2c34';
      ctx.fillRect(x, y, LOUPE_PX, LOUPE_PX);
      if ((c & 255) !== 0) {
        ctx.fillStyle = `rgba(${c >>> 24},${(c >>> 16) & 255},${(c >>> 8) & 255},${(c & 255) / 255})`;
        ctx.fillRect(x, y, LOUPE_PX, LOUPE_PX);
      }
    });
    ctx.strokeStyle = draw ? '#e63946' : '#4da3ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(mid * LOUPE_PX + 1, mid * LOUPE_PX + 1, LOUPE_PX - 2, LOUPE_PX - 2);
  }

  return { update, hide() { canvas.hidden = true; } };
}
