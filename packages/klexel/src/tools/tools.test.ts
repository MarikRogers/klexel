import { describe, it, expect } from 'vitest';
import { linePoints } from './line';
import { floodFill } from './fill';
import { PixelDocument } from '../model/Document';
import { History } from '../model/History';

describe('linePoints', () => {
  it('einzelner Punkt', () => expect(linePoints(2, 2, 2, 2)).toEqual([[2, 2]]));
  it('horizontal und lückenlos diagonal', () => {
    expect(linePoints(0, 0, 3, 0)).toHaveLength(4);
    expect(linePoints(0, 0, 3, 3)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
  });
  it('rückwärts enthält beide Enden', () => {
    const p = linePoints(5, 1, 1, 3);
    expect(p[0]).toEqual([5, 1]); expect(p[p.length - 1]).toEqual([1, 3]);
  });
});

describe('floodFill', () => {
  it('füllt nur den zusammenhängenden Bereich', () => {
    const d = new PixelDocument(5, 5); const h = new History(d);
    h.begin(); for (let y = 0; y < 5; y++) h.set(2, y, 1); h.commit(); // Trennwand
    h.begin(); floodFill(d, h, 0, 0, 9); h.commit();
    expect(d.get(0, 0)).toBe(9); expect(d.get(1, 4)).toBe(9);
    expect(d.get(2, 2)).toBe(1); expect(d.get(3, 0)).toBe(0);
  });
  it('gleiche Farbe ist ein No-op, Fill ist ein Undo-Schritt', () => {
    const d = new PixelDocument(3, 3); const h = new History(d);
    h.begin(); floodFill(d, h, 1, 1, 0); h.commit(); expect(h.canUndo).toBe(false);
    h.begin(); floodFill(d, h, 1, 1, 4); h.commit();
    expect(d.data.every(v => v === 4)).toBe(true);
    h.undo(); expect(d.data.every(v => v === 0)).toBe(true);
  });
  it('Füllen wirkt nur auf die aktive Ebene', () => {
    const d = new PixelDocument(4, 4); const h = new History(d);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) d.ensureCel(d.layers[0].id, 1)[y * 4 + x] = 0xff0000ff;
    d.touch();
    h.addLayer(); // Ebene 2 aktiv, leer
    h.begin(); floodFill(d, h, 0, 0, 0x00ff00ff); h.commit();
    expect(d.ensureCel(d.layers[1].id, 1).every(v => v === 0x00ff00ff)).toBe(true);
    expect(d.ensureCel(d.layers[0].id, 1)[0]).toBe(0xff0000ff);
    expect(d.ensureCel(d.layers[0].id, 1)[3]).toBe(0);
  });
});
