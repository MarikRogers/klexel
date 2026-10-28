import { PixelDocument, Color } from '../model/Document';
import { History } from '../model/History';

/** Flood-Fill (4er-Nachbarschaft, Scanline). Muss zwischen history.begin()/commit() laufen. */
export function floodFill(doc: PixelDocument, history: History, sx: number, sy: number, color: Color): void {
  if (!doc.inBounds(sx, sy)) return;
  const target = doc.get(sx, sy);
  if (target === color) return;
  const { width: w, height: h } = doc;
  const stack: Array<[number, number]> = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (doc.get(x, y) !== target) continue;
    let l = x, r = x;
    while (l > 0 && doc.get(l - 1, y) === target) l--;
    while (r < w - 1 && doc.get(r + 1, y) === target) r++;
    for (let i = l; i <= r; i++) history.set(i, y, color);
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      let inRun = false;
      for (let i = l; i <= r; i++) {
        const match = doc.get(i, ny) === target;
        if (match && !inRun) stack.push([i, ny]);
        inRun = match;
      }
    }
  }
}
