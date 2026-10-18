import { describe, it, expect } from 'vitest';
import { PixelDocument } from '../model/Document';
import { History } from '../model/History';
import { Selection } from '../model/Selection';
import { SelectionSession } from './SelectionSession';

const R = 0xff0000ff, G = 0x00ff00ff, B = 0x0000ffff, W = 0xffffffff;

function setup() {
  const doc = new PixelDocument(8, 8);
  const history = new History(doc);
  const session = new SelectionSession(() => doc, () => history);
  const cel = doc.ensureCel(doc.activeId, doc.currentFrameId);
  cel[1 * 8 + 1] = R; cel[1 * 8 + 2] = G; cel[2 * 8 + 1] = B; cel[2 * 8 + 2] = W;
  session.select(Selection.rect(8, 8, 1, 1, 2, 2), 'replace');
  return { doc, history, session };
}

describe('SelectionSession: skalieren', () => {
  it('beginScale lifts the selection and returns a copy as base', () => {
    const { session } = setup();
    const r = session.beginScale();
    expect(r.reason).toBe('ok');
    expect(r.base).toMatchObject({ w: 2, h: 2, x: 1, y: 1 });
    expect(session.isFloating).toBe(true);
    // base ist eine Kopie: Änderungen an der schwebenden Auswahl berühren sie nicht
    session.scaleTo(r.base!, { x: 1, y: 1, w: 4, h: 4 });
    expect(r.base!.w).toBe(2);
    expect(r.base!.pixels.length).toBe(4);
  });

  it('scaleTo replaces the floating selection and its mask', () => {
    const { session } = setup();
    const { base } = session.beginScale();
    session.scaleTo(base!, { x: 1, y: 1, w: 4, h: 4 });
    expect(session.floating).toMatchObject({ w: 4, h: 4, x: 1, y: 1 });
    expect(session.selection!.bounds()).toEqual({ x: 1, y: 1, w: 4, h: 4 });
    expect(session.selection!.count()).toBe(16);
  });

  it('commit places the scaled image and is exactly one undo step', () => {
    const { doc, history, session } = setup();
    const { base } = session.beginScale();
    session.scaleTo(base!, { x: 1, y: 1, w: 4, h: 4 });
    session.commit();
    expect(doc.getComposite(1, 1)).toBe(R);
    expect(doc.getComposite(4, 1)).toBe(G);
    expect(doc.getComposite(1, 4)).toBe(B);
    expect(doc.getComposite(4, 4)).toBe(W);
    expect(history.undo()).toBe(true);
    expect(doc.getComposite(4, 4)).toBe(0);
    expect(doc.getComposite(1, 1)).toBe(R);
    expect(doc.getComposite(2, 2)).toBe(W);
    expect(history.canUndo).toBe(false);
  });

  it('going back and forth within one gesture loses nothing', () => {
    const { session } = setup();
    const { base } = session.beginScale();
    session.scaleTo(base!, { x: 1, y: 1, w: 7, h: 5 });
    session.scaleTo(base!, { x: 1, y: 1, w: 1, h: 1 });
    session.scaleTo(base!, { x: 1, y: 1, w: 2, h: 2 });
    expect(session.floating).toEqual(base);
  });

  it('restoreScale brings back the base and cancel restores the picture', () => {
    const { doc, session } = setup();
    const { base } = session.beginScale();
    session.scaleTo(base!, { x: 0, y: 0, w: 5, h: 5 });
    session.restoreScale(base!);
    expect(session.floating).toEqual(base);
    session.cancel();
    expect(session.isFloating).toBe(false);
    expect(doc.getComposite(1, 1)).toBe(R);
    expect(doc.getComposite(2, 2)).toBe(W);
  });

  it('a locked or hidden layer reports the reason and changes nothing', () => {
    const { doc, session } = setup();
    doc.setLayerProps(doc.activeId, { locked: true });
    expect(session.beginScale()).toEqual({ reason: 'locked', base: null });
    expect(session.isFloating).toBe(false);
    doc.setLayerProps(doc.activeId, { locked: false, visible: false });
    expect(session.beginScale()).toEqual({ reason: 'hidden', base: null });
    expect(doc.getComposite(1, 1)).toBe(0); // unsichtbar, aber Zelle unverändert
    expect(doc.ensureCel(doc.activeId, doc.currentFrameId)[1 * 8 + 1]).toBe(R);
  });

  it('without a selection there is nothing to scale', () => {
    const doc = new PixelDocument(4, 4);
    const history = new History(doc);
    const session = new SelectionSession(() => doc, () => history);
    expect(session.beginScale()).toEqual({ reason: 'none', base: null });
  });

  it('an already moved floating selection becomes the base', () => {
    const { session } = setup();
    session.moveBy(3, 0);
    const { base } = session.beginScale();
    expect(base).toMatchObject({ x: 4, y: 1, w: 2, h: 2 });
  });
});
