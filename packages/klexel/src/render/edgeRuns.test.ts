import { describe, it, expect } from 'vitest';
import { Selection } from '../model/Selection';
import { edgeRuns, whiteEdges } from './edgeRuns';

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
  it('donut: outer ring runs have length 5, hole runs length 3', () => {
    const outer = Selection.rect(8, 8, 1, 1, 5, 5);
    const r = runs(outer.combine(Selection.rect(8, 8, 2, 2, 4, 4), 'subtract'));
    expect(r.filter(x => x.len === 5)).toHaveLength(4);
    expect(r.filter(x => x.len === 3)).toHaveLength(4);
  });
  it('two diagonally touching pixels merge collinear edges: 6 runs (4 x len 1, 2 x len 2)', () => {
    const a = Selection.rect(8, 8, 1, 1, 1, 1);
    const r = runs(a.combine(Selection.rect(8, 8, 2, 2, 2, 2), 'add'));
    expect(r).toHaveLength(6);
    expect(r.filter(x => x.len === 1)).toHaveLength(4);
    expect(r.filter(x => x.len === 2)).toHaveLength(2);
  });
});

describe('whiteEdges', () => {
  it('single pixel shows both colours: exactly the even-parity edges are white', () => {
    const e = Selection.rect(8, 8, 1, 1, 1, 1).edges();
    const w = whiteEdges(e);
    expect(w).toHaveLength(2);
    expect(w.every(x => (x.x + x.y) % 2 === 0)).toBe(true);
    expect(e.length - w.length).toBe(2);
  });
  it('2x2 block: white edges are exactly those with even parity', () => {
    const e = Selection.rect(8, 8, 2, 2, 3, 3).edges();
    const w = whiteEdges(e);
    expect(w.length).toBe(e.filter(x => (x.x + x.y) % 2 === 0).length);
    expect(w.length).toBeGreaterThan(0);
    expect(w.length).toBeLessThan(e.length);
  });
  it('a straight edge alternates per pixel', () => {
    const w = whiteEdges(Selection.rect(8, 8, 1, 1, 4, 1).edges()).filter(x => x.dir === 'h' && x.y === 1);
    expect(w.map(x => x.x)).toEqual([1, 3]);
  });
  it('caches per edges array', () => {
    const e = Selection.rect(8, 8, 1, 1, 2, 2).edges();
    expect(whiteEdges(e)).toBe(whiteEdges(e));
  });
});
