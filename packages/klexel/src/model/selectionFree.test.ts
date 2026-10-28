import { describe, it, expect } from 'vitest';
import { Selection } from './Selection';

describe('Selection.polygon', () => {
  it('Quadrat wählt Pixel nach Pixelmitten', () => {
    const s = Selection.polygon(8, 8, [[1, 1], [5, 1], [5, 5], [1, 5]]);
    expect(s.count()).toBe(16);
    expect(s.contains(1, 1)).toBe(true);
    expect(s.contains(4, 4)).toBe(true);
    expect(s.contains(5, 5)).toBe(false);
    expect(s.contains(0, 0)).toBe(false);
  });

  it('achsenparalleles Quadrat entspricht rect', () => {
    const p = Selection.polygon(8, 8, [[1, 1], [5, 1], [5, 5], [1, 5]]);
    const r = Selection.rect(8, 8, 1, 1, 4, 4);
    expect(Array.from(p.mask)).toEqual(Array.from(r.mask));
  });

  it('Dreieck ist symmetrisch zur Diagonalen', () => {
    const s = Selection.polygon(8, 8, [[0, 0], [8, 0], [0, 8]]);
    expect(s.contains(1, 1)).toBe(true);
    expect(s.contains(7, 7)).toBe(false);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) expect(s.contains(x, y)).toBe(s.contains(y, x));
    }
  });

  it('konkave L-Form lässt die Einbuchtung frei', () => {
    const s = Selection.polygon(8, 8, [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]);
    expect(s.count()).toBe(12);
    expect(s.contains(1, 3)).toBe(true);
    expect(s.contains(3, 1)).toBe(true);
    expect(s.contains(3, 3)).toBe(false);
    expect(s.contains(2, 2)).toBe(false);
  });

  it('Selbstüberschneidung: Loch der Schleife bleibt unausgewählt (Even-Odd)', () => {
    // Pentagramm: das Mittelpentagon hat Windungszahl 2 und ist ein Loch
    const pts: Array<[number, number]> = [];
    for (let k = 0; k < 5; k++) {
      const a = (-90 + 144 * k) * Math.PI / 180;
      pts.push([10 + 9 * Math.cos(a), 10 + 9 * Math.sin(a)]);
    }
    const s = Selection.polygon(20, 20, pts);
    expect(s.contains(10, 10)).toBe(false);
    expect(s.contains(10, 3)).toBe(true);
    expect(s.count()).toBeGreaterThan(0);
  });

  it('teilweise außerhalb wird geklemmt', () => {
    const s = Selection.polygon(8, 8, [[-3, -3], [3, -3], [3, 3], [-3, 3]]);
    expect(s.count()).toBe(9);
    expect(s.contains(2, 2)).toBe(true);
    expect(s.contains(3, 3)).toBe(false);
  });

  it('komplett außerhalb ist leer', () => {
    expect(Selection.polygon(8, 8, [[10, 10], [14, 10], [14, 14], [10, 14]]).isEmpty()).toBe(true);
  });

  it('entartete Pfade sind leer', () => {
    expect(Selection.polygon(8, 8, []).isEmpty()).toBe(true);
    expect(Selection.polygon(8, 8, [[2, 2]]).isEmpty()).toBe(true);
    expect(Selection.polygon(8, 8, [[2, 2], [6, 6]]).isEmpty()).toBe(true);
    expect(Selection.polygon(8, 8, [[2, 2], [2, 2], [2, 2]]).isEmpty()).toBe(true);
    expect(Selection.polygon(8, 8, [[1, 1], [3, 3], [6, 6]]).isEmpty()).toBe(true);
    expect(Selection.polygon(8, 8, [[1, 1], [1, 1], [6, 6], [6, 6], [1, 1]]).isEmpty()).toBe(true);
  });

  it('aufeinanderfolgende Duplikate ändern das Ergebnis nicht', () => {
    const a = Selection.polygon(8, 8, [[1, 1], [5, 1], [5, 5], [1, 5]]);
    const b = Selection.polygon(8, 8, [[1, 1], [1, 1], [5, 1], [5, 1], [5, 5], [1, 5], [1, 5], [1, 1]]);
    expect(Array.from(b.mask)).toEqual(Array.from(a.mask));
  });
});

describe('Selection.region', () => {
  // 7 = zwei nur diagonal verbundene Flächen (links oben, rechts unten)
  const px = new Uint32Array([
    7, 7, 0, 0,
    7, 7, 0, 0,
    0, 0, 7, 7,
    0, 0, 7, 7,
  ]);

  it('zusammenhängend: nur die getippte Fläche (keine Diagonalen)', () => {
    const s = Selection.region(4, 4, px, 0, 0, true);
    expect(s.count()).toBe(4);
    expect(s.contains(1, 1)).toBe(true);
    expect(s.contains(2, 2)).toBe(false);
  });

  it('nicht zusammenhängend: alle Pixel dieser Farbe', () => {
    const s = Selection.region(4, 4, px, 0, 0, false);
    expect(s.count()).toBe(8);
    expect(s.contains(3, 3)).toBe(true);
  });

  it('Tippen auf 0 wählt zusammenhängend nur die Teilfläche', () => {
    const s = Selection.region(4, 4, px, 3, 0, true);
    expect(s.count()).toBe(4);
    expect(s.contains(2, 1)).toBe(true);
    expect(s.contains(0, 3)).toBe(false);
    expect(Selection.region(4, 4, px, 3, 0, false).count()).toBe(8);
  });

  it('leere Cel (undefined) wählt die gesamte Fläche', () => {
    expect(Selection.region(4, 4, undefined, 2, 2, true).count()).toBe(16);
    expect(Selection.region(4, 4, undefined, 2, 2, false).count()).toBe(16);
  });

  it('Startpixel außerhalb ist leer', () => {
    expect(Selection.region(4, 4, px, -1, 0, true).isEmpty()).toBe(true);
    expect(Selection.region(4, 4, px, 0, 99, false).isEmpty()).toBe(true);
    expect(Selection.region(4, 4, undefined, 4, 0, true).isEmpty()).toBe(true);
  });

  it('Pixel am Rand (x = 0 und x = w-1) korrekt', () => {
    const edge = new Uint32Array([
      5, 0, 0, 5,
      5, 0, 0, 5,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const l = Selection.region(4, 4, edge, 0, 1, true);
    expect(Array.from(l.mask.slice(0, 8))).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    expect(l.count()).toBe(2);
    const r = Selection.region(4, 4, edge, 3, 0, true);
    expect(r.count()).toBe(2);
    expect(r.contains(3, 1)).toBe(true);
    expect(Selection.region(4, 4, edge, 0, 0, false).count()).toBe(4);
  });

  it('falsche Cel-Länge wirft RangeError', () => {
    expect(() => Selection.region(4, 4, new Uint32Array(15), 0, 0, true)).toThrow(RangeError);
  });
});
