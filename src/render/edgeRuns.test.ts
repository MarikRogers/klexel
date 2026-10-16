import { describe, it, expect } from 'vitest';
import { Selection } from '../model/Selection';
import { edgeRuns } from './edgeRuns';

const runs = (s: Selection) => edgeRuns(s.edges());

describe('edgeRuns', () => {
  it('1x1 gives 4 runs', () => {
    expect(runs(Selection.rect(8, 8, 2, 2, 2, 2))).toHaveLength(4);
  });
  it('2x2 gives 4 runs of length 2', () => {
    const r = runs(Selection.rect(8, 8, 2, 2, 3, 3));
    expect(r).toHaveLength(4);
    expect(r.every(x => x.len === 2)).toBe(true);
  });
  it('donut gives 8 runs', () => {
    const outer = Selection.rect(8, 8, 1, 1, 5, 5);
    const hole = Selection.rect(8, 8, 2, 2, 4, 4);
    expect(runs(outer.combine(hole, 'subtract'))).toHaveLength(8);
  });
  it('two separated pixels give 8 runs', () => {
    const a = Selection.rect(8, 8, 1, 1, 1, 1);
    expect(runs(a.combine(Selection.rect(8, 8, 5, 5, 5, 5), 'add'))).toHaveLength(8);
  });
  it('collinear adjacent edges merge into one run', () => {
    const r = runs(Selection.rect(8, 8, 1, 1, 4, 1));
    expect(r.filter(x => x.dir === 'h' && x.y === 1)).toEqual([{ x: 1, y: 1, dir: 'h', len: 4 }]);
  });
  it('caches per edges array', () => {
    const e = Selection.rect(8, 8, 1, 1, 2, 2).edges();
    expect(edgeRuns(e)).toBe(edgeRuns(e));
  });
});
