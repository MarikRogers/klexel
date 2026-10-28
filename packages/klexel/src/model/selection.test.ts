import { describe, it, expect } from 'vitest';
import { Selection } from './Selection';

describe('Selection.rect', () => {
  it('vertauschte Ecken ergeben dieselbe Maske', () => {
    const a = Selection.rect(8, 8, 2, 3, 5, 6);
    const b = Selection.rect(8, 8, 5, 6, 2, 3);
    expect(Array.from(b.mask)).toEqual(Array.from(a.mask));
  });
  it('beide Ecken inklusive', () => {
    expect(Selection.rect(8, 8, 2, 3, 4, 3).count()).toBe(3);
  });
  it('wird auf die Fläche geklemmt', () => {
    expect(Selection.rect(4, 4, -5, -5, 1, 1).count()).toBe(4);
  });
  it('komplett außerhalb ist leer', () => {
    expect(Selection.rect(4, 4, 10, 10, 12, 12).isEmpty()).toBe(true);
  });
});

describe('Selection basics', () => {
  it('all zählt alle Pixel', () => {
    expect(Selection.all(3, 2).count()).toBe(6);
  });
  it('empty hat keine bounds', () => {
    expect(Selection.empty(3, 2).bounds()).toBeNull();
  });
  it('bounds eines Rechtecks', () => {
    expect(Selection.rect(8, 8, 2, 3, 4, 5).bounds()).toEqual({ x: 2, y: 3, w: 3, h: 3 });
  });
  it('contains außerhalb ist false', () => {
    const s = Selection.all(4, 4);
    expect(s.contains(-1, 0)).toBe(false);
    expect(s.contains(0, 99)).toBe(false);
    expect(s.contains(0, 0)).toBe(true);
  });
});

describe('Selection.combine', () => {
  it('add vereint getrennte Rechtecke', () => {
    const a = Selection.rect(10, 10, 0, 0, 1, 1);
    const b = Selection.rect(10, 10, 5, 5, 6, 6);
    expect(a.combine(b, 'add').count()).toBe(8);
  });
  it('subtract schneidet ein Loch', () => {
    const big = Selection.rect(10, 10, 0, 0, 4, 4);
    const mid = Selection.rect(10, 10, 1, 1, 3, 3);
    const r = big.combine(mid, 'subtract');
    expect(r.contains(2, 2)).toBe(false);
    expect(r.contains(0, 0)).toBe(true);
    expect(r.count()).toBe(25 - 9);
  });
  it('replace liefert die Maske der zweiten', () => {
    const a = Selection.rect(10, 10, 0, 0, 1, 1);
    const b = Selection.rect(10, 10, 5, 5, 6, 6);
    expect(Array.from(a.combine(b, 'replace').mask)).toEqual(Array.from(b.mask));
  });
  it('subtract bis leer', () => {
    const a = Selection.rect(4, 4, 1, 1, 2, 2);
    expect(a.combine(a, 'subtract').isEmpty()).toBe(true);
  });
  it('ungleiche Größen werfen', () => {
    expect(() => Selection.all(3, 3).combine(Selection.all(4, 4), 'add')).toThrow(RangeError);
  });
  it('Operanden bleiben unverändert', () => {
    const a = Selection.rect(10, 10, 0, 0, 1, 1);
    const b = Selection.rect(10, 10, 1, 1, 2, 2);
    const aMask = Array.from(a.mask);
    const bMask = Array.from(b.mask);
    a.combine(b, 'add');
    a.combine(b, 'subtract');
    a.combine(b, 'replace');
    expect(Array.from(a.mask)).toEqual(aMask);
    expect(Array.from(b.mask)).toEqual(bMask);
  });
});

describe('Selection.translated', () => {
  it('verschiebt', () => {
    const s = Selection.rect(8, 8, 1, 1, 2, 2).translated(1, 0);
    expect(s.bounds()).toEqual({ x: 2, y: 1, w: 2, h: 2 });
  });
  it('über den Rand ist leer', () => {
    expect(Selection.rect(4, 4, 1, 1, 2, 2).translated(10, 0).isEmpty()).toBe(true);
  });
  it('negativ schneidet links ab', () => {
    expect(Selection.rect(4, 4, 0, 0, 1, 1).translated(-1, 0).count()).toBe(2);
  });
});

describe('Selection.edges', () => {
  it('2x2 in 4x4 hat 8 Kanten', () => {
    expect(Selection.rect(4, 4, 1, 1, 2, 2).edges()).toHaveLength(8);
  });
  it('einzelnes Pixel hat 4 Kanten', () => {
    expect(Selection.rect(4, 4, 1, 1, 1, 1).edges()).toHaveLength(4);
  });
  it('zwei getrennte Pixel haben 8 Kanten', () => {
    const s = Selection.rect(4, 4, 0, 0, 0, 0).combine(Selection.rect(4, 4, 3, 3, 3, 3), 'add');
    expect(s.edges()).toHaveLength(8);
  });
  it('Rechteck am Rand enthält x=width und y=height', () => {
    const e = Selection.all(2, 2).edges();
    expect(e).toHaveLength(8);
    expect(e).toContainEqual({ x: 2, y: 0, dir: 'v' });
    expect(e).toContainEqual({ x: 0, y: 2, dir: 'h' });
  });
  it('memoisiert', () => {
    const s = Selection.rect(4, 4, 1, 1, 2, 2);
    expect(s.edges()).toBe(s.edges());
  });
  it('leere Auswahl hat keine Kanten', () => {
    expect(Selection.empty(4, 4).edges()).toEqual([]);
  });
});
