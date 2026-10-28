import { describe, it, expect } from 'vitest';
import { rectPoints, ellipsePoints } from './shapes';

const key = (pts: Array<[number, number]>) => new Set(pts.map(([x, y]) => `${x},${y}`));

describe('rectPoints', () => {
  it('Umriss: Rand ja, Inneres nein, keine Duplikate', () => {
    const pts = rectPoints(0, 0, 3, 2, false);
    const k = key(pts);
    expect(k.size).toBe(pts.length);
    expect(k.size).toBe(10); // 4x3 Box, Inneres 2x1 fehlt
    expect(k.has('1,1')).toBe(false);
    expect(k.has('0,0') && k.has('3,2')).toBe(true);
  });
  it('gefüllt: alle Pixel der Box', () => {
    expect(rectPoints(0, 0, 3, 2, true)).toHaveLength(12);
  });
  it('Ziehrichtung egal', () => {
    expect(key(rectPoints(3, 2, 0, 0, false))).toEqual(key(rectPoints(0, 0, 3, 2, false)));
  });
  it('1x1 und 1-Pixel-Linie als Umriss', () => {
    expect(rectPoints(2, 2, 2, 2, false)).toEqual([[2, 2]]);
    expect(rectPoints(0, 0, 4, 0, false)).toHaveLength(5);
  });
});

describe('ellipsePoints', () => {
  it('bleibt in der Ziehbox und ist symmetrisch', () => {
    const k = key(ellipsePoints(0, 0, 8, 4, false));
    for (const s of k) {
      const [x, y] = s.split(',').map(Number);
      expect(x >= 0 && x <= 8 && y >= 0 && y <= 4).toBe(true);
      expect(k.has(`${8 - x},${y}`)).toBe(true);
      expect(k.has(`${x},${4 - y}`)).toBe(true);
    }
  });
  it('berührt alle vier Kanten der Box', () => {
    const k = key(ellipsePoints(0, 0, 8, 6, false));
    const pts = [...k].map(s => s.split(',').map(Number));
    expect(pts.some(p => p[0] === 0)).toBe(true);
    expect(pts.some(p => p[0] === 8)).toBe(true);
    expect(pts.some(p => p[1] === 0)).toBe(true);
    expect(pts.some(p => p[1] === 6)).toBe(true);
  });
  it('gefüllt enthält den Umriss und den Mittelpunkt, keine Duplikate', () => {
    const outline = key(ellipsePoints(0, 0, 8, 8, false));
    const filledPts = ellipsePoints(0, 0, 8, 8, true);
    const filled = key(filledPts);
    expect(filled.size).toBe(filledPts.length);
    for (const s of outline) expect(filled.has(s)).toBe(true);
    expect(filled.has('4,4')).toBe(true);
    expect(filled.size).toBeGreaterThan(outline.size);
  });
  it('Ziehrichtung egal, Randfälle 1x1 und 2x2', () => {
    expect(key(ellipsePoints(8, 6, 0, 0, true))).toEqual(key(ellipsePoints(0, 0, 8, 6, true)));
    expect(ellipsePoints(3, 3, 3, 3, false)).toEqual([[3, 3]]);
    expect(key(ellipsePoints(0, 0, 1, 1, true)).size).toBe(4);
  });
});
