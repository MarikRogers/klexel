import { describe, it, expect } from 'vitest';
import { flipFloating, rotateFloating90 } from './transform';
import type { Floating } from './SelectionSession';

function make(rows: number[][], x: number, y: number, mask?: number[][]): Floating {
  const h = rows.length;
  const w = rows[0].length;
  return {
    pixels: Uint32Array.from(rows.flat()),
    mask: Uint8Array.from((mask ?? rows.map((r) => r.map(() => 1))).flat()),
    w, h, x, y,
  };
}
const px = (f: Floating) => Array.from(f.pixels);

describe('flipFloating', () => {
  const f = make([[1, 2, 3], [4, 5, 6]], 3, 4, [[1, 1, 0], [0, 1, 1]]);

  it('mirrors horizontally, mask included, position unchanged', () => {
    const r = flipFloating(f, 'h');
    expect(px(r)).toEqual([3, 2, 1, 6, 5, 4]);
    expect(Array.from(r.mask)).toEqual([0, 1, 1, 1, 1, 0]);
    expect([r.x, r.y, r.w, r.h]).toEqual([3, 4, 3, 2]);
  });

  it('mirrors vertically', () => {
    const r = flipFloating(f, 'v');
    expect(px(r)).toEqual([4, 5, 6, 1, 2, 3]);
    expect(Array.from(r.mask)).toEqual([0, 1, 1, 1, 1, 0]);
  });

  it('twice is the original', () => {
    for (const axis of ['h', 'v'] as const) {
      const r = flipFloating(flipFloating(f, axis), axis);
      expect(px(r)).toEqual(px(f));
      expect(Array.from(r.mask)).toEqual(Array.from(f.mask));
    }
  });
});

describe('rotateFloating90', () => {
  it('rotates clockwise', () => {
    const r = rotateFloating90(make([[1, 2, 3], [4, 5, 6]], 10, 20));
    expect([r.w, r.h]).toEqual([2, 3]);
    expect(px(r)).toEqual([4, 1, 5, 2, 6, 3]);
    expect([r.x, r.y]).toEqual([10, 20]);
  });

  it('keeps the position of a square', () => {
    const r = rotateFloating90(make([[1, 2, 3], [4, 5, 6], [7, 8, 9]], 5, 5));
    expect([r.x, r.y]).toEqual([5, 5]);
    expect(px(r)).toEqual([7, 4, 1, 8, 5, 2, 9, 6, 3]);
  });

  it('rotates the mask along', () => {
    const r = rotateFloating90(make([[1, 2, 3], [4, 5, 6]], 0, 0, [[1, 0, 0], [1, 1, 0]]));
    expect(Array.from(r.mask)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it('four rotations return pixels, mask, size and position', () => {
    const cases = [
      make([[1, 2, 3, 4]], 2, 2, [[1, 0, 1, 1]]),
      make([[1, 2, 3], [4, 5, 6]], 7, 3, [[1, 0, 1], [0, 1, 1]]),
      make([[1], [2], [3], [4], [5]], 1, 1),
    ];
    for (const f of cases) {
      let r = f;
      for (let i = 0; i < 4; i++) r = rotateFloating90(r);
      expect(px(r)).toEqual(px(f));
      expect(Array.from(r.mask)).toEqual(Array.from(f.mask));
      expect([r.w, r.h, r.x, r.y]).toEqual([f.w, f.h, f.x, f.y]);
    }
  });
});
