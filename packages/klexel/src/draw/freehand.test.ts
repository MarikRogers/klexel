import { describe, it, expect } from 'vitest';
import { PixelDocument } from '../model/Document';
import { History } from '../model/History';
import { FreehandStroke } from './freehand';

function setup(pixelPerfect: boolean) {
  const doc = new PixelDocument(8, 8);
  const history = new History(doc);
  const stroke = new FreehandStroke(() => history, () => pixelPerfect);
  const px = (x: number, y: number) => doc.cel(doc.activeId, doc.currentFrameId)?.[y * 8 + x] ?? 0;
  const count = () => (doc.cel(doc.activeId, doc.currentFrameId) ?? new Uint32Array()).reduce((n, v) => n + (v ? 1 : 0), 0);
  return { doc, history, stroke, px, count };
}

describe('FreehandStroke', () => {
  it('single point sets one pixel', () => {
    const { stroke, px, count } = setup(true);
    stroke.begin(); stroke.point(3, 3, 9); stroke.end(true);
    expect(px(3, 3)).toBe(9);
    expect(count()).toBe(1);
  });

  it('pixel-perfect off keeps the L corner', () => {
    const { stroke, px, count } = setup(false);
    stroke.begin(); stroke.point(0, 0, 9); stroke.point(1, 0, 9); stroke.point(1, 1, 9); stroke.end(true);
    expect(count()).toBe(3);
    expect(px(1, 0)).toBe(9);
  });

  it('pixel-perfect on removes the L corner', () => {
    const { stroke, px, count } = setup(true);
    stroke.begin(); stroke.point(0, 0, 9); stroke.point(1, 0, 9); stroke.point(1, 1, 9); stroke.end(true);
    expect(count()).toBe(2);
    expect(px(1, 0)).toBe(0);
  });

  it('pixels painted before the stroke keep their value when removed', () => {
    const { stroke, px } = setup(true);
    stroke.begin(); stroke.point(1, 0, 5); stroke.end(true);
    stroke.begin(); stroke.point(0, 0, 9); stroke.point(1, 0, 9); stroke.point(1, 1, 9); stroke.end(true);
    expect(px(1, 0)).toBe(5);
    expect(px(0, 0)).toBe(9);
    expect(px(1, 1)).toBe(9);
  });

  it('eraser color 0 works with pixel-perfect', () => {
    const { stroke, count, px } = setup(true);
    stroke.begin();
    for (let i = 0; i < 4; i++) stroke.point(i, 0, 9);
    stroke.end(true);
    stroke.begin(); stroke.point(0, 0, 0); stroke.point(1, 0, 0); stroke.point(1, 1, 0); stroke.end(true);
    expect(px(0, 0)).toBe(0); // gelöscht
    expect(px(1, 0)).toBe(9); // L-Ecke: das mittlere Pixel wird nicht gelöscht
    expect(count()).toBe(3);
  });

  it('end(true) makes exactly one undo step, end(false) none', () => {
    const { stroke, history, count } = setup(true);
    stroke.begin(); stroke.point(0, 0, 9); stroke.point(4, 0, 9); stroke.end(true);
    expect(history.undo()).toBe(true);
    expect(history.canUndo).toBe(false);
    expect(count()).toBe(0);
    stroke.begin(); stroke.point(2, 2, 9); stroke.end(false);
    expect(history.canUndo).toBe(false);
    expect(count()).toBe(0);
  });

  it('a self-crossing stroke leaves pixels outside the stroke untouched', () => {
    const { stroke, history, px } = setup(true);
    stroke.begin(); stroke.point(7, 7, 5); stroke.end(true);
    stroke.begin();
    for (const [x, y] of [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0], [1, 1]] as const) stroke.point(x, y, 9);
    stroke.end(true);
    expect(px(7, 7)).toBe(5);
    history.undo();
    expect(px(0, 0)).toBe(0);
    expect(px(1, 1)).toBe(0);
    expect(px(7, 7)).toBe(5);
  });

  it('interpolation fills the gaps between points', () => {
    const { stroke, count } = setup(true);
    stroke.begin(); stroke.point(0, 0, 9); stroke.point(4, 0, 9); stroke.end(true);
    expect(count()).toBe(5);
  });

  it('end reports whether an undo step was created', () => {
    const { stroke } = setup(true);
    stroke.begin(); stroke.point(1, 1, 9);
    expect(stroke.end(true)).toBe(true);
    stroke.begin(); stroke.point(1, 1, 9); // gleicher Wert wie schon gesetzt
    expect(stroke.end(true)).toBe(false);
    stroke.begin(); stroke.point(2, 2, 9);
    expect(stroke.end(false)).toBe(false);
  });

  it('active reflects an open stroke', () => {
    const { stroke } = setup(true);
    expect(stroke.active).toBe(false);
    stroke.begin();
    expect(stroke.active).toBe(true);
    stroke.end(false);
    expect(stroke.active).toBe(false);
  });

  it('brush size stamps a square around the point and clips at the edge', () => {
    const doc = new PixelDocument(8, 8);
    const history = new History(doc);
    const stroke = new FreehandStroke(() => history, () => true, () => 3);
    stroke.begin(); stroke.point(0, 0, 9); stroke.end(true);
    const cel = doc.cel(doc.activeId, doc.currentFrameId)!;
    expect(cel.reduce((n, v) => n + (v ? 1 : 0), 0)).toBe(4);
    expect(cel[1 * 8 + 1]).toBe(9);
  });
});
