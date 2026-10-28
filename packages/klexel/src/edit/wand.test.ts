import { describe, it, expect } from 'vitest';
import { PixelDocument } from '../model/Document';
import { History } from '../model/History';
import { Selection } from '../model/Selection';
import { SelectionSession } from './SelectionSession';
import { wandSelect } from './wand';

const RED = 0xff0000ff, BLUE = 0x0000ffff;

function setup() {
  const doc = new PixelDocument(8, 8);
  const history = new History(doc);
  const session = new SelectionSession(() => doc, () => history);
  const cel = doc.ensureCel(doc.activeId, doc.currentFrameId);
  return { doc, history, session, cel };
}
const rect = (x0: number, y0: number, x1: number, y1: number) => Selection.rect(8, 8, x0, y0, x1, y1);
const cells = (s: Selection | null) => {
  const out: string[] = [];
  if (s) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (s.contains(x, y)) out.push(`${x},${y}`);
  return out;
};

describe('wandSelect', () => {
  it('reads the committed picture after a floating move (hole and new position)', () => {
    const { doc, history, session, cel } = setup();
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) cel[y * 8 + x] = BLUE;
    session.select(rect(0, 0, 1, 1), 'replace');
    session.moveBy(4, 4);
    expect(session.isFloating).toBe(true);
    wandSelect(session, doc, 4, 4, false, 'replace');
    expect(session.isFloating).toBe(false);
    expect(history.strokeOpen).toBe(false);
    expect(cells(session.selection)).toEqual(['4,4', '5,4', '4,5', '5,5']);
  });

  it('reads the committed picture after a floating move (hole)', () => {
    const { doc, history, session, cel } = setup();
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) cel[y * 8 + x] = BLUE;
    session.select(rect(0, 0, 1, 1), 'replace');
    session.moveBy(4, 4);
    wandSelect(session, doc, 0, 0, false, 'replace'); // Loch: transparente Fläche des committeten Bildes
    expect(session.isFloating).toBe(false);
    expect(history.strokeOpen).toBe(false);
    const sel = cells(session.selection);
    expect(sel).toContain('0,0');
    expect(sel).toContain('7,7');
    expect(sel).not.toContain('4,4'); // dort liegt nach dem Absetzen der Block
    expect(sel).toHaveLength(60);
  });

  it('all = true picks every pixel of the colour', () => {
    const { doc, session, cel } = setup();
    cel[0] = RED; cel[7] = RED; cel[9] = BLUE;
    wandSelect(session, doc, 0, 0, true, 'replace');
    expect(cells(session.selection)).toEqual(['0,0', '7,0']);
    wandSelect(session, doc, 0, 0, false, 'replace');
    expect(cells(session.selection)).toEqual(['0,0']);
  });

  it('selecting works on a locked or hidden layer without lifting', () => {
    const { doc, history, session, cel } = setup();
    cel[0] = RED;
    doc.setLayerProps(doc.activeId, { locked: true });
    wandSelect(session, doc, 0, 0, false, 'replace');
    expect(cells(session.selection)).toEqual(['0,0']);
    doc.setLayerProps(doc.activeId, { locked: false, visible: false });
    session.deselect();
    wandSelect(session, doc, 0, 0, false, 'replace');
    expect(cells(session.selection)).toEqual(['0,0']);
    expect(session.isFloating).toBe(false);
    expect(history.strokeOpen).toBe(false);
  });

  it('a tap outside the area does nothing, not even a commit', () => {
    const { doc, session, cel } = setup();
    cel[0] = RED;
    session.select(rect(0, 0, 0, 0), 'replace');
    session.moveBy(3, 3);
    wandSelect(session, doc, -1, 2, false, 'replace');
    wandSelect(session, doc, 8, 2, false, 'add');
    expect(session.isFloating).toBe(true);
    expect(cells(session.selection)).toEqual(['3,3']);
  });
});
