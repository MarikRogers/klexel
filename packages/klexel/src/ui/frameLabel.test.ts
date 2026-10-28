import { describe, it, expect, vi } from 'vitest';
import { frameLabel, frameTitle, askFrameRename, RENAME_PROMPT } from './frameLabel';
import { PixelDocument } from '../model/Document';
import { History } from '../model/History';

describe('frameLabel', () => {
  it('nimmt den Namen, sonst die Nummer', () => {
    expect(frameLabel({ id: 7, name: 'Lauf' }, 0)).toBe('Lauf');
    expect(frameLabel({ id: 7 }, 2)).toBe('3');
    expect(frameLabel({ id: 7, name: '' }, 0)).toBe('1');
  });
});

describe('frameTitle', () => {
  it('nennt Nummer und Namen', () => {
    expect(frameTitle({ id: 7, name: 'Lauf' }, 1)).toBe('Frame 2: Lauf');
    expect(frameTitle({ id: 7 }, 0)).toBe('Frame 1');
  });
});

describe('askFrameRename (Knopf „Frame umbenennen“)', () => {
  function setup() {
    const doc = new PixelDocument(2, 2);
    const h = new History(doc);
    h.addFrame();
    return { doc, h, apply: (id: number, name: string) => { h.renameFrame(id, name); } };
  }

  it('benennt den aktuellen Frame um; Rückgängig stellt den alten Namen wieder her', () => {
    const { doc, h, apply } = setup();
    const cur = doc.currentFrameId;
    expect(doc.frames[1].id).toBe(cur);
    const ask = (msg: string, current: string) => { expect(msg).toBe(RENAME_PROMPT); expect(current).toBe(''); return '  upperArm_L '; };
    expect(askFrameRename(doc.frames, cur, ask, apply)).toBe(true);
    expect(doc.frames[1].name).toBe('upperArm_L');
    expect(doc.frames[0].name).toBeUndefined();
    expect(frameLabel(doc.frames[1], 1)).toBe('upperArm_L');
    // vorhandener Name wird vorgeschlagen
    askFrameRename(doc.frames, cur, (_m, current) => { expect(current).toBe('upperArm_L'); return 'kopf'; }, apply);
    expect(doc.frames[1].name).toBe('kopf');
    h.undo();
    expect(doc.frames[1].name).toBe('upperArm_L');
    h.undo();
    expect(doc.frames[1].name).toBeUndefined();
  });

  it('Abbrechen oder unbekannter Frame ändern nichts', () => {
    const { doc, apply } = setup();
    const ask = vi.fn(() => null);
    expect(askFrameRename(doc.frames, doc.currentFrameId, ask, apply)).toBe(false);
    expect(doc.frames.every(f => f.name === undefined)).toBe(true);
    const never = vi.fn(() => 'x');
    expect(askFrameRename(doc.frames, 999, never, apply)).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });
});
