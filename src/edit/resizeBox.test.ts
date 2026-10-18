import { describe, it, expect } from 'vitest';
import { resizeBox, type Box, type HandleId } from './resizeBox';

const start: Box = { x: 10, y: 10, w: 20, h: 10 };
const right = (b: Box) => b.x + b.w, bottom = (b: Box) => b.y + b.h;

describe('resizeBox: Ecken (proportional, Gegenecke fest)', () => {
  it('se: dragging outward keeps the ratio and the top-left corner', () => {
    expect(resizeBox('se', start, 10, 5)).toEqual({ x: 10, y: 10, w: 30, h: 15 });
  });

  it('nw: keeps the bottom-right corner fixed', () => {
    const b = resizeBox('nw', start, -10, -5);
    expect(b).toEqual({ x: 0, y: 5, w: 30, h: 15 });
    expect([right(b), bottom(b)]).toEqual([right(start), bottom(start)]);
  });

  it('ne: keeps the bottom-left corner fixed', () => {
    const b = resizeBox('ne', start, 10, -5);
    expect(b.x).toBe(start.x);
    expect(bottom(b)).toBe(bottom(start));
    expect([b.w, b.h]).toEqual([30, 15]);
  });

  it('sw: keeps the top-right corner fixed', () => {
    const b = resizeBox('sw', start, -10, 5);
    expect(right(b)).toBe(right(start));
    expect(b.y).toBe(start.y);
    expect([b.w, b.h]).toEqual([30, 15]);
  });

  it('the larger factor wins', () => {
    // dx +2 → 1.1, dy +9 → 1.9: die Höhe gibt den Faktor vor
    expect(resizeBox('se', start, 2, 9)).toEqual({ x: 10, y: 10, w: 38, h: 19 });
  });

  it('dragging past the opposite side keeps the smallest proportional size', () => {
    expect(resizeBox('se', start, -100, -100)).toEqual({ x: 10, y: 10, w: 2, h: 1 });
  });

  it('never exceeds 128 on either side', () => {
    const b = resizeBox('se', start, 500, 500);
    expect(Math.max(b.w, b.h)).toBe(128);
    expect(b.w / b.h).toBeCloseTo(2, 0);
  });
});

describe('resizeBox: Balken (eine Achse, Gegenkante fest)', () => {
  it('e changes only the width', () => {
    expect(resizeBox('e', start, 5, 99)).toEqual({ x: 10, y: 10, w: 25, h: 10 });
  });

  it('w keeps the right edge', () => {
    const b = resizeBox('w', start, -5, 99);
    expect(b).toEqual({ x: 5, y: 10, w: 25, h: 10 });
    expect(right(b)).toBe(right(start));
  });

  it('s changes only the height, n keeps the bottom edge', () => {
    expect(resizeBox('s', start, 99, 4)).toEqual({ x: 10, y: 10, w: 20, h: 14 });
    const n = resizeBox('n', start, 99, -4);
    expect(n).toEqual({ x: 10, y: 6, w: 20, h: 14 });
    expect(bottom(n)).toBe(bottom(start));
  });

  it('dragging past the opposite edge gives 1, never 0 or negative', () => {
    const ids: HandleId[] = ['e', 'w', 's', 'n'];
    for (const id of ids) {
      const b = resizeBox(id, start, id === 'e' ? -100 : 100, id === 's' ? -100 : 100);
      expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(1);
    }
    expect(resizeBox('e', start, -100, 0).w).toBe(1);
    expect(resizeBox('n', start, 0, 100).h).toBe(1);
  });

  it('caps a bar at 128', () => {
    expect(resizeBox('e', start, 999, 0).w).toBe(128);
  });
});

describe('resizeBox: Rundung', () => {
  it('rounds fractional movement to whole pixels', () => {
    expect(resizeBox('e', start, 2.4, 0).w).toBe(22);
    expect(resizeBox('e', start, 2.6, 0).w).toBe(23);
  });

  it('zero movement returns the start box', () => {
    for (const id of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleId[]) {
      expect(resizeBox(id, start, 0, 0)).toEqual(start);
    }
  });
});
