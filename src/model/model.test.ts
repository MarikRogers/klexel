import { describe, it, expect } from 'vitest';
import { PixelDocument } from './Document';
import { History } from './History';

describe('PixelDocument', () => {
  it('lehnt ungültige Größen ab', () => {
    expect(() => new PixelDocument(0, 8)).toThrow();
    expect(() => new PixelDocument(129, 8)).toThrow();
    expect(() => new PixelDocument(1.5, 8)).toThrow();
  });
  it('ignoriert Zugriffe außerhalb', () => {
    const d = new PixelDocument(4, 4);
    expect(d.set(-1, 0, 1)).toBe(false);
    expect(d.get(9, 9)).toBe(0);
  });
});

describe('History', () => {
  const setup = () => { const d = new PixelDocument(4, 4); return { d, h: new History(d) }; };

  it('macht einen Strich in einem Schritt rückgängig und wiederholt ihn', () => {
    const { d, h } = setup();
    h.begin(); h.set(0, 0, 5); h.set(1, 0, 5); h.commit();
    h.undo();
    expect(d.get(0, 0)).toBe(0); expect(d.get(1, 0)).toBe(0);
    h.redo();
    expect(d.get(0, 0)).toBe(5); expect(d.get(1, 0)).toBe(5);
  });
  it('behält beim Überschreiben im selben Strich den Ursprungswert', () => {
    const { d, h } = setup();
    h.begin(); h.set(0, 0, 1); h.set(0, 0, 2); h.commit();
    h.undo();
    expect(d.get(0, 0)).toBe(0);
  });
  it('cancel stellt den Zustand wieder her und legt keinen Schritt an', () => {
    const { d, h } = setup();
    h.begin(); h.set(2, 2, 7); h.cancel();
    expect(d.get(2, 2)).toBe(0); expect(h.canUndo).toBe(false);
  });
  it('neuer Strich leert Redo; Limit wird eingehalten', () => {
    const d = new PixelDocument(4, 4); const h = new History(d, 2);
    for (let i = 1; i <= 3; i++) { h.begin(); h.set(i, 0, i); h.commit(); }
    h.undo(); h.undo();
    expect(h.undo()).toBe(false); // nur 2 Schritte behalten
    h.redo(); h.begin(); h.set(0, 3, 9); h.commit();
    expect(h.canRedo).toBe(false);
  });
});
