import { describe, it, expect } from 'vitest';
import { loupeCells, loupeSide, LOUPE_CELLS, LOUPE_PX, LOUPE_SIZE } from './loupe';

describe('constants', () => {
  it('match the spec', () => {
    expect([LOUPE_CELLS, LOUPE_PX, LOUPE_SIZE]).toEqual([9, 12, 108]);
  });
});

describe('loupeCells', () => {
  const w = 5, h = 5;
  const pixels = new Uint32Array(w * h).map((_, i) => i + 1);

  it('returns 81 cells with the cursor pixel in the middle', () => {
    const cells = loupeCells(pixels, w, h, 2, 2);
    expect(cells.length).toBe(81);
    expect(cells[40]).toBe(13); // (2,2) → Index 12 → Wert 13
  });

  it('marks cells outside the document as null', () => {
    const cells = loupeCells(pixels, w, h, 0, 0);
    expect(cells[40]).toBe(1);
    expect(cells[0]).toBeNull();                 // (-4,-4)
    expect(cells[3 * 9 + 4]).toBeNull();         // (0,-1)
    expect(cells[4 * 9 + 3]).toBeNull();         // (-1,0)
    expect(cells[4 * 9 + 5]).toBe(2);            // (1,0)
    expect(cells[5 * 9 + 4]).toBe(6);            // (0,1)
  });

  it('works for a 1x1 document', () => {
    const cells = loupeCells(new Uint32Array([7]), 1, 1, 0, 0);
    expect(cells[40]).toBe(7);
    expect(cells.filter(c => c === null).length).toBe(80);
  });
});

describe('loupeSide', () => {
  it('stays on the left when the cursor is far away', () => {
    expect(loupeSide(300, 300, 8)).toBe('left');
    expect(loupeSide(20, 400, 8)).toBe('left');
    expect(loupeSide(400, 20, 8)).toBe('left');
  });

  it('moves to the right when the cursor is under the loupe', () => {
    expect(loupeSide(20, 70, 8)).toBe('right');
    expect(loupeSide(100, 150, 8)).toBe('right');
  });

  it('switches exactly at the threshold', () => {
    // x-Schwelle bei Zoom 8: 10 + 108 + (2.2 * 8 + 20) = 155.6
    expect(loupeSide(155, 70, 8)).toBe('right');
    expect(loupeSide(156, 70, 8)).toBe('left');
    // y-Schwelle bei Zoom 8: 56 + 108 + 37.6 = 201.6
    expect(loupeSide(20, 201, 8)).toBe('right');
    expect(loupeSide(20, 202, 8)).toBe('left');
  });
});
