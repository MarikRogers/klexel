import { describe, it, expect } from 'vitest';
import { handleLayout, hitHandle, type ScreenRect, type HandleGeom } from './handles';
import type { HandleId } from './resizeBox';

const view = { width: 400, height: 600 };
const IDS: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const intersects = (a: ScreenRect, b: ScreenRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h && a.w > 0 && a.h > 0;
const inside = (g: HandleGeom, x: number, y: number) => x >= g.zone.x && x < g.zone.x + g.zone.w && y >= g.zone.y && y < g.zone.y + g.zone.h;
const byId = (hs: HandleGeom[], id: HandleId) => hs.find(h => h.id === id)!;

describe('handleLayout', () => {
  const box: ScreenRect = { x: 100, y: 200, w: 160, h: 120 };

  it('returns all eight handles', () => {
    expect(handleLayout(box, view).map(h => h.id).sort()).toEqual([...IDS].sort());
  });

  it('gives every zone the full touch size and keeps it outside the box', () => {
    for (const touch of [44, 40]) {
      for (const h of handleLayout(box, view, touch)) {
        expect([h.zone.w, h.zone.h]).toEqual([touch, touch]);
        expect(intersects(h.zone, box)).toBe(false);
        expect(inside(h, h.cx, h.cy)).toBe(true);
      }
    }
  });

  it('places corners diagonally outside and bars at the middle of the edges', () => {
    const hs = handleLayout(box, view);
    expect(byId(hs, 'nw').kind).toBe('corner');
    expect(byId(hs, 'n').kind).toBe('bar');
    expect(byId(hs, 'nw').cx).toBeLessThan(box.x);
    expect(byId(hs, 'nw').cy).toBeLessThan(box.y);
    expect(byId(hs, 'n').cy).toBeLessThan(box.y);
    expect(byId(hs, 'n').cx).toBeCloseTo(box.x + box.w / 2);
    expect(byId(hs, 'se').cx).toBeGreaterThan(box.x + box.w);
    expect(byId(hs, 'e').cx).toBeGreaterThan(box.x + box.w);
    expect(byId(hs, 'e').cy).toBeCloseTo(box.y + box.h / 2);
  });

  it('never covers the inside of tiny boxes', () => {
    for (const size of [1, 8]) {
      const tiny: ScreenRect = { x: 200, y: 300, w: size, h: size };
      for (const h of handleLayout(tiny, view)) expect(intersects(h.zone, tiny)).toBe(false);
      const hs = handleLayout(tiny, view);
      expect(hitHandle(hs, tiny.x + size / 2, tiny.y + size / 2)).toBeNull();
    }
  });

  it('the middle of a box hits no handle', () => {
    const hs = handleLayout(box, view);
    expect(hitHandle(hs, box.x + box.w / 2, box.y + box.h / 2)).toBeNull();
  });

  it('prefers a corner where corner and bar zones overlap on a small box', () => {
    const small: ScreenRect = { x: 200, y: 300, w: 20, h: 20 };
    const hs = handleLayout(small, view);
    const nw = byId(hs, 'nw'), n = byId(hs, 'n');
    // gemeinsamer Punkt in beiden Zonen
    const px = Math.max(nw.zone.x, n.zone.x) + 1, py = Math.max(nw.zone.y, n.zone.y) + 1;
    expect(inside(nw, px, py) && inside(n, px, py)).toBe(true);
    expect(hitHandle(hs, px, py)).toBe('nw');
  });

  it('a box at the left edge cuts the west zone to the visible area and never into the box', () => {
    const edge: ScreenRect = { x: 0, y: 200, w: 100, h: 100 };
    for (const h of handleLayout(edge, view)) expect(intersects(h.zone, edge)).toBe(false);
    const w = byId(handleLayout(edge, view), 'w');
    expect(w.zone.w).toBe(0); // kein Platz links der Fläche: nicht treffbar
    expect(hitHandle(handleLayout(edge, view), -5, 250)).toBeNull();
  });

  it('keeps zones inside the visible area when the box is near the edge', () => {
    const near: ScreenRect = { x: 10, y: 200, w: 100, h: 100 };
    for (const h of handleLayout(near, view)) {
      expect(h.zone.x).toBeGreaterThanOrEqual(0);
      expect(h.zone.y).toBeGreaterThanOrEqual(0);
      expect(h.zone.x + h.zone.w).toBeLessThanOrEqual(view.width);
      expect(h.zone.y + h.zone.h).toBeLessThanOrEqual(view.height);
    }
  });

  it('does not throw for a box far outside the area', () => {
    expect(() => handleLayout({ x: -500, y: 5000, w: 40, h: 40 }, view)).not.toThrow();
    expect(hitHandle(handleLayout({ x: -500, y: 5000, w: 40, h: 40 }, view), 10, 10)).toBeNull();
  });
});

describe('hitHandle', () => {
  it('returns the handle whose zone contains the point', () => {
    const hs = handleLayout({ x: 100, y: 200, w: 160, h: 120 }, view);
    const n = byId(hs, 'n');
    expect(hitHandle(hs, n.cx, n.cy)).toBe('n');
    const se = byId(hs, 'se');
    expect(hitHandle(hs, se.cx, se.cy)).toBe('se');
  });

  it('returns null outside every zone', () => {
    const hs = handleLayout({ x: 100, y: 200, w: 160, h: 120 }, view);
    expect(hitHandle(hs, 390, 10)).toBeNull();
  });
});
