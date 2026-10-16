import { describe, it, expect } from 'vitest';
import { PixelDocument, blendOver } from '../model/Document';
import { History } from '../model/History';
import { Selection } from '../model/Selection';
import { SelectionSession } from './SelectionSession';

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

describe('SelectionSession select', () => {
  it('replace, add and subtract change the selection', () => {
    const { session } = setup();
    session.select(rect(0, 0, 1, 1), 'replace');
    expect(session.selection!.count()).toBe(4);
    session.select(rect(4, 4, 5, 5), 'add');
    expect(session.selection!.count()).toBe(8);
    session.select(rect(0, 0, 0, 1), 'subtract');
    expect(session.selection!.count()).toBe(6);
    session.select(rect(2, 2, 3, 3), 'replace');
    expect(session.selection!.count()).toBe(4);
  });

  it('an empty result means no selection', () => {
    const { session } = setup();
    session.select(rect(0, 0, 1, 1), 'replace');
    session.select(rect(0, 0, 1, 1), 'subtract');
    expect(session.hasSelection).toBe(false);
    expect(session.selection).toBeNull();
  });

  it('hitTest, selectAll and deselect', () => {
    const { session } = setup();
    expect(session.hitTest(1, 1)).toBe(false);
    session.select(rect(1, 1, 2, 2), 'replace');
    expect(session.hitTest(1, 1)).toBe(true);
    expect(session.hitTest(3, 3)).toBe(false);
    session.selectAll();
    expect(session.selection!.count()).toBe(64);
    session.deselect();
    expect(session.hasSelection).toBe(false);
    expect(session.selection).toBeNull();
  });

  it('commits a floating selection first', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 1, 1), 'replace');
    session.moveBy(2, 0);
    session.select(rect(6, 6, 7, 7), 'replace');
    expect(session.isFloating).toBe(false);
    expect(history.strokeOpen).toBe(false);
    expect(doc.get(3, 1)).toBe(5);
    expect(session.selection!.count()).toBe(4);
    expect(session.hitTest(6, 6)).toBe(true);
    history.undo();
    expect(doc.get(1, 1)).toBe(5);
    expect(history.canUndo).toBe(false);
  });
});

describe('SelectionSession lift', () => {
  it('lifts the pixels and leaves the stroke open', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 2, 2), 'replace');
    expect(session.lift()).toBe('ok');
    expect(session.isFloating).toBe(true);
    expect(history.strokeOpen).toBe(true);
    expect(doc.get(1, 1)).toBe(0);
    const f = session.floating!;
    expect([f.x, f.y, f.w, f.h]).toEqual([1, 1, 2, 2]);
    expect(f.pixels[0]).toBe(5);
    expect(f.mask[0]).toBe(1);
    expect(f.pixels.slice(1).every((v) => v === 0)).toBe(true);
  });

  it('copies only masked pixels', () => {
    const { doc, session } = setup();
    fill(doc, 0, 0, 7);
    fill(doc, 1, 1, 8);
    session.select(rect(0, 0, 0, 0), 'replace');
    session.select(rect(1, 1, 1, 1), 'add');
    fill(doc, 1, 0, 9);
    session.lift();
    const f = session.floating!;
    expect(Array.from(f.pixels)).toEqual([7, 0, 0, 8]);
    expect(Array.from(f.mask)).toEqual([1, 0, 0, 1]);
    expect(doc.get(1, 0)).toBe(9);
  });

  it('returns none without a selection', () => {
    const { history, session } = setup();
    expect(session.lift()).toBe('none');
    expect(history.strokeOpen).toBe(false);
  });

  it('is blocked on locked and hidden layers', () => {
    for (const [props, expected] of [[{ locked: true }, 'locked'], [{ visible: false }, 'hidden']] as const) {
      const { doc, history, session } = setup();
      fill(doc, 1, 1, 5);
      session.select(rect(1, 1, 1, 1), 'replace');
      doc.setLayerProps(doc.activeId, props);
      expect(session.lift()).toBe(expected);
      expect(session.moveBy(1, 1)).toBe(expected);
      expect(session.isFloating).toBe(false);
      expect(history.strokeOpen).toBe(false);
      expect(history.canUndo).toBe(false);
      expect(doc.get(1, 1)).toBe(5);
      expect(session.hitTest(1, 1)).toBe(true);
    }
  });

  it('lifts nothing from a missing cel and does not create one', () => {
    const { doc, history, session } = setup();
    session.select(rect(1, 1, 2, 2), 'replace');
    expect(session.lift()).toBe('ok');
    expect(session.isFloating).toBe(true);
    expect(doc.cel(doc.activeId, doc.currentFrameId)).toBeUndefined();
    session.cancel();
    expect(history.strokeOpen).toBe(false);
    expect(doc.cel(doc.activeId, doc.currentFrameId)).toBeUndefined();
  });
});

describe('SelectionSession moveBy', () => {
  it('moves only the floating position and the selection follows', () => {
    const { doc, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 1, 1), 'replace');
    expect(session.moveBy(2, 3)).toBe('ok');
    expect(session.isFloating).toBe(true);
    expect([session.floating!.x, session.floating!.y]).toEqual([3, 4]);
    expect(doc.get(1, 1)).toBe(0);
    expect(doc.get(3, 4)).toBe(0);
    expect(session.hitTest(3, 4)).toBe(true);
    expect(session.hitTest(1, 1)).toBe(false);
    session.moveBy(1, 0);
    expect([session.floating!.x, session.floating!.y]).toEqual([4, 4]);
  });
});

describe('SelectionSession commit', () => {
  it('drops the pixels at the target in one undo step', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 1, 1), 'replace');
    session.moveBy(2, 0);
    session.moveBy(0, 2);
    session.commit();
    expect(doc.get(3, 3)).toBe(5);
    expect(doc.get(1, 1)).toBe(0);
    expect(session.isFloating).toBe(false);
    expect(history.strokeOpen).toBe(false);
    expect(session.hitTest(3, 3)).toBe(true);
    expect(session.hitTest(1, 1)).toBe(false);
    expect(history.undo()).toBe(true);
    expect(doc.get(1, 1)).toBe(5);
    expect(doc.get(3, 3)).toBe(0);
    expect(history.canUndo).toBe(false);
    expect(history.redo()).toBe(true);
    expect(doc.get(1, 1)).toBe(0);
    expect(doc.get(3, 3)).toBe(5);
  });

  it('clips at the edge', () => {
    const { doc, session } = setup();
    for (const [x, y] of [[6, 6], [7, 6], [6, 7], [7, 7]]) fill(doc, x, y, 5);
    session.select(rect(6, 6, 7, 7), 'replace');
    session.moveBy(1, 1);
    session.commit();
    expect(doc.get(7, 7)).toBe(5);
    expect(doc.get(6, 6)).toBe(0);
    expect(doc.get(7, 6)).toBe(0);
    expect(doc.get(6, 7)).toBe(0);
    expect(session.selection!.count()).toBe(1);
    expect(session.hitTest(7, 7)).toBe(true);
  });

  it('writes nothing when completely outside', () => {
    const { doc, history, session } = setup();
    fill(doc, 6, 6, 5);
    session.select(rect(6, 6, 6, 6), 'replace');
    session.moveBy(5, 5);
    session.commit();
    expect(doc.get(6, 6)).toBe(0);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(doc.get(x, y)).toBe(0);
    expect(session.isFloating).toBe(false);
    expect(history.canUndo).toBe(true);
  });

  it('applies the alpha rules', () => {
    const run = (src: number) => {
      const { doc, session } = setup();
      fill(doc, 0, 0, src);
      fill(doc, 3, 3, 0xff0000ff);
      session.select(rect(0, 0, 0, 0), 'replace');
      session.moveBy(3, 3);
      session.commit();
      return doc.get(3, 3);
    };
    expect(run(0x0000ffff)).toBe(0x0000ffff);
    expect(run(0x00ff0080)).toBe(blendOver(0xff0000ff, 0x00ff0080, 100));
    expect(run(0x00ff0080)).not.toBe(0xff0000ff);
    const { doc, session } = setup();
    fill(doc, 3, 3, 0xff0000ff);
    session.select(rect(0, 0, 0, 0), 'replace');
    session.moveBy(3, 3);
    session.commit();
    expect(doc.get(3, 3)).toBe(0xff0000ff);
  });
});

describe('SelectionSession cancel and reset', () => {
  it('cancel restores cel and selection position', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 1, 1), 'replace');
    session.moveBy(3, 3);
    session.cancel();
    expect(doc.get(1, 1)).toBe(5);
    expect(doc.get(4, 4)).toBe(0);
    expect(session.isFloating).toBe(false);
    expect(history.strokeOpen).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(session.hitTest(1, 1)).toBe(true);
    expect(session.hitTest(4, 4)).toBe(false);
  });

  it('reset discards mask and floating without a step', () => {
    const { doc, history, session } = setup();
    fill(doc, 1, 1, 5);
    session.select(rect(1, 1, 1, 1), 'replace');
    session.moveBy(3, 3);
    session.reset();
    expect(doc.get(1, 1)).toBe(5);
    expect(session.hasSelection).toBe(false);
    expect(session.isFloating).toBe(false);
    expect(history.strokeOpen).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('repeated commit, cancel and deselect are harmless', () => {
    const { history, session } = setup();
    session.commit();
    session.cancel();
    session.deselect();
    session.deselect();
    session.reset();
    expect(history.canUndo).toBe(false);
    expect(history.strokeOpen).toBe(false);
    session.select(rect(1, 1, 1, 1), 'replace');
    session.commit();
    session.cancel();
    expect(session.hasSelection).toBe(true);
    expect(history.canUndo).toBe(false);
  });

  it('keeps an unset clip untouched by reset', () => {
    const { session } = setup();
    session.reset();
    expect(session.clip).toBeNull();
  });
});
