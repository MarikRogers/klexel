import { describe, it, expect } from 'vitest';
import { fingerToCell, OFFSET_X, OFFSET_Y } from './cursorMap';

const v = { panX: 0, panY: 0, zoom: 8 };

describe('fingerToCell', () => {
  it('uses the spec offsets', () => {
    expect(OFFSET_Y).toBe(84);
    expect(OFFSET_X).toBe(28);
  });

  it('puts the cursor up-left of the finger for right-handers', () => {
    expect(fingerToCell(100, 200, 'R', v, 32, 32)).toEqual([9, 14]);
  });

  it('puts the cursor up-right of the finger for left-handers', () => {
    expect(fingerToCell(100, 200, 'L', v, 32, 32)).toEqual([16, 14]);
  });

  it('clamps to the document on all sides for both hands', () => {
    for (const hand of ['R', 'L'] as const) {
      expect(fingerToCell(0, 0, hand, v, 32, 32)).toEqual([hand === 'L' ? 3 : 0, 0]);
      expect(fingerToCell(-500, -500, hand, v, 32, 32)).toEqual([0, 0]);
      expect(fingerToCell(9999, 9999, hand, v, 32, 32)).toEqual([31, 31]);
    }
  });

  it('respects pan and zoom', () => {
    // x: (100 - 28 - 40) / 4 = 8, y: (200 - 84 - 16) / 4 = 25
    expect(fingerToCell(100, 200, 'R', { panX: 40, panY: 16, zoom: 4 }, 32, 32)).toEqual([8, 25]);
  });

  it('stays inside a 1x1 and a 1x5 document', () => {
    expect(fingerToCell(300, 300, 'R', v, 1, 1)).toEqual([0, 0]);
    expect(fingerToCell(300, 300, 'R', v, 1, 5)).toEqual([0, 4]);
    expect(fingerToCell(-300, -300, 'L', v, 1, 5)).toEqual([0, 0]);
  });
});
