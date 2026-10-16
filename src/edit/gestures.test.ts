import { describe, it, expect } from 'vitest';
import { exceedsTapThreshold, appendPathPoint } from './gestures';

describe('exceedsTapThreshold', () => {
  it('unter der Schwelle: Tap', () => {
    expect(exceedsTapThreshold(10, 10, 12, 13)).toBe(false);
    expect(exceedsTapThreshold(10, 10, 10, 10)).toBe(false);
  });
  it('genau auf der Schwelle: noch Tap', () => {
    expect(exceedsTapThreshold(0, 0, 6, 0)).toBe(false);
  });
  it('ueber der Schwelle: Geste', () => {
    expect(exceedsTapThreshold(0, 0, 7, 0)).toBe(true);
    expect(exceedsTapThreshold(0, 0, 0, -7)).toBe(true);
  });
  it('diagonale Distanz (4,4 = 5.66 < 6; 5,5 = 7.07 > 6)', () => {
    expect(exceedsTapThreshold(0, 0, 4, 4)).toBe(false);
    expect(exceedsTapThreshold(0, 0, 5, 5)).toBe(true);
  });
  it('eigene Schwelle', () => {
    expect(exceedsTapThreshold(0, 0, 9, 0, 10)).toBe(false);
    expect(exceedsTapThreshold(0, 0, 11, 0, 10)).toBe(true);
  });
});

describe('appendPathPoint', () => {
  it('haengt neue Punkte an und meldet die Aenderung', () => {
    const pts: Array<[number, number]> = [];
    expect(appendPathPoint(pts, 1, 2)).toBe(true);
    expect(appendPathPoint(pts, 3, 2)).toBe(true);
    expect(pts).toEqual([[1, 2], [3, 2]]);
  });
  it('verwirft aufeinanderfolgende Duplikate', () => {
    const pts: Array<[number, number]> = [[1, 2]];
    expect(appendPathPoint(pts, 1, 2)).toBe(false);
    expect(pts).toEqual([[1, 2]]);
  });
  it('erlaubt Rueckkehr zu einem frueheren Punkt (nicht aufeinanderfolgend)', () => {
    const pts: Array<[number, number]> = [[1, 2], [2, 2]];
    expect(appendPathPoint(pts, 1, 2)).toBe(true);
    expect(pts).toHaveLength(3);
  });
});
