import { describe, it, expect } from 'vitest';
import { PixelPerfect, isLCorner, type Pt } from './pixelPerfect';

/** Wendet die Ergebnisse von push() auf eine Punktliste an. */
function run(points: Pt[]): Pt[] {
  const pp = new PixelPerfect();
  const kept: Pt[] = [];
  for (const [x, y] of points) {
    const r = pp.push(x, y);
    if (r.unset) {
      const i = kept.findIndex(([a, b]) => a === r.unset![0] && b === r.unset![1]);
      kept.splice(i, 1);
    }
    if (r.set) kept.push(r.set);
  }
  return kept;
}

describe('isLCorner', () => {
  it('is true for L shapes in all orientations', () => {
    expect(isLCorner([0, 0], [1, 0], [1, 1])).toBe(true);
    expect(isLCorner([0, 0], [0, 1], [1, 1])).toBe(true);
    expect(isLCorner([1, 1], [1, 0], [0, 0])).toBe(true);
    expect(isLCorner([1, 0], [0, 0], [0, 1])).toBe(true);
  });

  it('is false for straight lines, diagonals and distant points', () => {
    expect(isLCorner([0, 0], [1, 0], [2, 0])).toBe(false);
    expect(isLCorner([0, 0], [1, 1], [2, 2])).toBe(false);
    expect(isLCorner([0, 0], [1, 0], [1, 2])).toBe(false);
    expect(isLCorner([0, 0], [1, 0], [0, 0])).toBe(false);
  });
});

describe('PixelPerfect', () => {
  it('turns a staircase into a diagonal', () => {
    expect(run([[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]])).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('leaves a straight line unchanged', () => {
    expect(run([[0, 0], [1, 0], [2, 0], [3, 0]])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });

  it('keeps one and two pixel strokes', () => {
    expect(run([[4, 4]])).toEqual([[4, 4]]);
    expect(run([[0, 0], [1, 0]])).toEqual([[0, 0], [1, 0]]);
  });

  it('ignores a repeated point', () => {
    const pp = new PixelPerfect();
    pp.push(0, 0);
    expect(pp.push(0, 0)).toEqual({ unset: null, set: null });
  });

  it('forgets the previous stroke after reset', () => {
    const pp = new PixelPerfect();
    pp.push(0, 0); pp.push(1, 0);
    pp.reset();
    expect(pp.push(1, 1)).toEqual({ unset: null, set: [1, 1] });
  });
});
