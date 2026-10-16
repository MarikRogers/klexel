import { describe, it, expect } from 'vitest';
import { PixelDocument } from '../model/Document';
import { History } from '../model/History';
import { Selection } from '../model/Selection';
import { SelectionSession, undoAction } from './SelectionSession';

function setup() {
  const doc = new PixelDocument(8, 8);
  const history = new History(doc);
  const session = new SelectionSession(() => doc, () => history);
  return { doc, history, session };
}

function fill(doc: PixelDocument, x: number, y: number, c: number): void {
  doc.ensureCel(doc.activeId, doc.currentFrameId)[y * doc.width + x] = c;
}

const rect = (x0: number, y0: number, x1: number, y1: number) => Selection.rect(8, 8, x0, y0, x1, y1);
const BLOCKS = [[{ locked: true }, 'locked'], [{ visible: false }, 'hidden']] as const;

describe('copy', () => {
  it('without selection is false and leaves the clipboard empty', () => {
    const { session } = setup();
    expect(session.copy()).toBe(false);
    expect(session.clip).toBeNull();
  });

  it('copies the masked pixels in the size of the bounds, cel untouched, allowed when locked', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    fill(doc, 2, 1, 6);
    fill(doc, 1, 2, 7);
    fill(doc, 2, 2, 8);
    session.select(rect(1, 1, 2, 2), 'replace');
    session.select(rect(2, 2, 2, 2), 'subtract');
    doc.setLayerProps(doc.activeId, { locked: true });
    expect(session.copy()).toBe(true);
    const c = session.clip!;
    expect([c.w, c.h]).toEqual([2, 2]);
    expect(Array.from(c.pixels)).toEqual([5, 6, 7, 0]);
    expect(Array.from(c.mask)).toEqual([1, 1, 1, 0]);
    expect(doc.get(2, 2)).toBe(8);
    expect(history.canUndo).toBe(false);
  });

  it('copies the floating content while floating', () => {
    const { doc, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 1, 1), 'replace');
    session.moveBy(3, 0);
    expect(session.copy()).toBe(true);
    expect(Array.from(session.clip!.pixels)).toEqual([5]);
    expect(session.isFloating).toBe(true);
  });
});

describe('cut and delete', () => {
  it('cut is copy plus delete as one undo step', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    fill(doc, 2, 1, 6);
    session.select(rect(1, 1, 2, 1), 'replace');
    expect(session.cut()).toBe('ok');
    expect(Array.from(session.clip!.pixels)).toEqual([5, 6]);
    expect(doc.get(1, 1)).toBe(0);
    expect(doc.get(2, 1)).toBe(0);
    expect(history.undo()).toBe(true);
    expect(doc.get(1, 1)).toBe(5);
    expect(doc.get(2, 1)).toBe(6);
    expect(history.canUndo).toBe(false);
  });

  it('cut and delete are blocked on locked or hidden layers', () => {
    for (const [props, expected] of BLOCKS) {
      const { doc, history, session } = setup();
      fill(doc, 1, 1, 5);
      session.select(rect(1, 1, 1, 1), 'replace');
      doc.setLayerProps(doc.activeId, props);
      expect(session.cut()).toBe(expected);
      expect(session.delete()).toBe(expected);
      expect(session.clip).toBeNull();
      expect(doc.get(1, 1)).toBe(5);
      expect(history.canUndo).toBe(false);
      expect(history.strokeOpen).toBe(false);
    }
  });

  it('delete without selection is none', () => {
    const { history, session } = setup();
    expect(session.delete()).toBe('none');
    expect(session.cut()).toBe('none');
    expect(history.canUndo).toBe(false);
  });

  it('delete clears the pixels as one step', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    fill(doc, 2, 1, 6);
    session.select(rect(1, 1, 2, 1), 'replace');
    expect(session.delete()).toBe('ok');
    expect(doc.get(1, 1)).toBe(0);
    expect(session.hasSelection).toBe(true);
    history.undo();
    expect(doc.get(2, 1)).toBe(6);
    expect(history.canUndo).toBe(false);
  });

  it('delete while floating discards the content, source stays cleared, one step', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 1, 1), 'replace');
    session.moveBy(3, 0);
    expect(session.delete()).toBe('ok');
    expect(session.isFloating).toBe(false);
    expect(history.strokeOpen).toBe(false);
    expect(doc.get(1, 1)).toBe(0);
    expect(doc.get(4, 1)).toBe(0);
    expect(session.hitTest(4, 1)).toBe(true);
    history.undo();
    expect(doc.get(1, 1)).toBe(5);
    expect(history.canUndo).toBe(false);
  });
});

describe('paste', () => {
  function copied() {
    const s = setup();
    fill(s.doc, 1, 1, 5);
    fill(s.doc, 2, 1, 6);
    s.session.select(rect(1, 1, 2, 1), 'replace');
    s.session.copy();
    s.session.deselect();
    return s;
  }

  it('without clipboard is none and creates no step', () => {
    const { history, session } = setup();
    expect(session.paste(4, 4)).toBe('none');
    expect(history.strokeOpen).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('places the clip around the center, commit writes to the active layer', () => {
    const { doc, history, session } = copied();
    expect(session.paste(4, 4)).toBe('ok');
    expect(session.isFloating).toBe(true);
    expect([session.floating!.x, session.floating!.y]).toEqual([3, 4]);
    expect(session.hitTest(3, 4)).toBe(true);
    expect(session.hitTest(5, 4)).toBe(false);
    session.commit();
    expect(doc.get(3, 4)).toBe(5);
    expect(doc.get(4, 4)).toBe(6);
    expect(history.undo()).toBe(true);
    expect(doc.get(3, 4)).toBe(0);
    expect(doc.get(1, 1)).toBe(5);
  });

  it('pastes into the current frame', () => {
    const { doc, history, session } = copied();
    const f1 = doc.currentFrameId;
    const f2 = history.addFrame()!.id;
    doc.setCurrentFrame(f2);
    session.paste(4, 4);
    session.commit();
    expect(doc.cel(doc.activeId, f2)![4 * 8 + 3]).toBe(5);
    expect(doc.cel(doc.activeId, f1)![4 * 8 + 3]).toBe(0);
  });

  it('pastes only onto the active layer', () => {
    const { doc, history, session } = copied();
    const a = doc.activeId;
    const b = history.addLayer()!.id;
    doc.setActive(b);
    session.paste(4, 4);
    session.commit();
    expect(doc.cel(b, doc.currentFrameId)![4 * 8 + 3]).toBe(5);
    expect(doc.cel(a, doc.currentFrameId)![4 * 8 + 3]).toBe(0);
  });

  it('is blocked on locked or hidden layers without floating or open stroke', () => {
    for (const [props, expected] of BLOCKS) {
      const { doc, history, session } = copied();
      doc.setLayerProps(doc.activeId, props);
      expect(session.paste(4, 4)).toBe(expected);
      expect(session.isFloating).toBe(false);
      expect(history.strokeOpen).toBe(false);
    }
  });

  it('clipboard survives reset', () => {
    const { session } = copied();
    session.reset();
    expect(session.clip).not.toBeNull();
    expect(session.paste(4, 4)).toBe('ok');
  });

  it('commits a floating selection first', () => {
    const { doc, history, session } = copied();
    session.select(rect(1, 1, 1, 1), 'replace');
    session.moveBy(0, 5);
    expect(session.paste(4, 4)).toBe('ok');
    expect(doc.get(1, 6)).toBe(5);
    session.commit();
    history.undo();
    expect(doc.get(3, 4)).toBe(0);
    expect(doc.get(1, 6)).toBe(5);
  });

  it('is clipped at commit when larger than the area', () => {
    const { doc, session } = copied();
    session.paste(7, 4);
    expect(session.floating!.x).toBe(6);
    session.commit();
    expect(doc.get(6, 4)).toBe(5);
    expect(doc.get(7, 4)).toBe(6);
    const big = setup();
    big.session.selectAll();
    big.session.copy();
    big.session.deselect();
    big.session.paste(8, 8);
    big.session.commit();
    expect(big.history.strokeOpen).toBe(false);
  });
});

describe('flip and rotate90', () => {
  it('lift on demand and transform the floating content', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    fill(doc, 2, 1, 6);
    session.select(rect(1, 1, 2, 1), 'replace');
    expect(session.flip('h')).toBe('ok');
    expect(session.isFloating).toBe(true);
    expect(Array.from(session.floating!.pixels)).toEqual([6, 5]);
    session.commit();
    expect(doc.get(1, 1)).toBe(6);
    expect(doc.get(2, 1)).toBe(5);
    history.undo();
    expect(doc.get(1, 1)).toBe(5);
    expect(history.canUndo).toBe(false);
  });

  it('rotate90 changes size, selection follows, commit writes rotated pixels in one step', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    fill(doc, 2, 1, 6);
    session.select(rect(1, 1, 2, 1), 'replace');
    expect(session.rotate90()).toBe('ok');
    expect([session.floating!.w, session.floating!.h]).toEqual([1, 2]);
    expect(session.selection!.count()).toBe(2);
    session.commit();
    // 2x1 -> 1x2 um die Mitte: x' = 1 + trunc(1/2) = 1, y' = 1 + trunc(-1/2) = 1
    expect(doc.get(1, 1)).toBe(5);
    expect(doc.get(1, 2)).toBe(6);
    expect(doc.get(2, 1)).toBe(0);
    expect(session.selection!.bounds()).toEqual({ x: 1, y: 1, w: 1, h: 2 });
    history.undo();
    expect(doc.get(1, 1)).toBe(5);
    expect(doc.get(2, 1)).toBe(6);
    expect(doc.get(1, 2)).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  it('cancel after rotate restores the original selection and pixels', () => {
    const { doc, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 2, 1), 'replace');
    session.rotate90();
    session.cancel();
    expect(doc.get(1, 1)).toBe(5);
    expect(session.selection!.bounds()).toEqual({ x: 1, y: 1, w: 2, h: 1 });
  });

  it('none and locked/hidden have no effect', () => {
    const { session } = setup();
    expect(session.flip('v')).toBe('none');
    expect(session.rotate90()).toBe('none');
    for (const [props, expected] of BLOCKS) {
      const { doc, history, session: s } = setup();
      fill(doc, 1, 1, 5);
      s.select(rect(1, 1, 2, 1), 'replace');
      doc.setLayerProps(doc.activeId, props);
      expect(s.flip('h')).toBe(expected);
      expect(s.rotate90()).toBe(expected);
      expect(s.isFloating).toBe(false);
      expect(history.strokeOpen).toBe(false);
      expect(history.canUndo).toBe(false);
    }
  });
});

describe('undoAction', () => {
  it('is cancel exactly while floating', () => {
    const { doc, session } = setup();
    fill(doc, 1, 1, 5);
    expect(undoAction(session)).toBe('undo');
    session.select(rect(1, 1, 1, 1), 'replace');
    expect(undoAction(session)).toBe('undo');
    session.moveBy(1, 0);
    expect(undoAction(session)).toBe('cancel');
    session.commit();
    expect(undoAction(session)).toBe('undo');
  });
});
