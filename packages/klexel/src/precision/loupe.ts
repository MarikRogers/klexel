import type { Color } from '../model/Document';

export const LOUPE_CELLS = 9;
export const LOUPE_PX = 12;
export const LOUPE_SIZE = LOUPE_CELLS * LOUPE_PX; // 108
/** Abstand der Lupe zum Rand der Zeichenfläche; oben bleibt der Platz für den ☰-Button frei. */
export const LOUPE_INSET_X = 10;
export const LOUPE_INSET_Y = 56;

/** 9×9 Dokumentpixel um (cx, cy), zeilenweise; `null` außerhalb des Dokuments. */
export function loupeCells(pixels: Uint32Array, w: number, h: number, cx: number, cy: number): Array<Color | null> {
  const half = (LOUPE_CELLS - 1) / 2;
  const out: Array<Color | null> = [];
  for (let j = -half; j <= half; j++) {
    for (let i = -half; i <= half; i++) {
      const x = cx + i, y = cy + j;
      out.push(x < 0 || y < 0 || x >= w || y >= h ? null : pixels[y * w + x]);
    }
  }
  return out;
}

/**
 * Auf welcher Seite die Lupe steht. Liegt die Cursorzelle (linke obere Ecke, Canvas-lokal) samt
 * Fadenkreuz-Armen und 20 px Rand im Bereich der Lupe oben links, wechselt sie nach rechts.
 */
export function loupeSide(cursorLeft: number, cursorTop: number, zoom: number): 'left' | 'right' {
  const reach = 2.2 * zoom + 20;
  const hit = cursorLeft < LOUPE_INSET_X + LOUPE_SIZE + reach && cursorTop < LOUPE_INSET_Y + LOUPE_SIZE + reach;
  return hit ? 'right' : 'left';
}
