import { describe, it, expect } from 'vitest';
import { changeKey } from './changeKey';
import { PixelDocument } from '../model/Document';
import { encodeKlexel } from './projectCodec';

const state = () => encodeKlexel(new PixelDocument(8, 8), [0xff0000ff, 0x00ff00ff], 0xff0000ff);

describe('changeKey', () => {
  it('gleicher Inhalt → gleicher Schlüssel', () => {
    expect(changeKey(state())).toBe(changeKey(state()));
  });

  it('ein Pixel anders → anderer Schlüssel', () => {
    const da = new PixelDocument(8, 8), db = new PixelDocument(8, 8);
    da.data[5] = 0x123456ff; db.data[5] = 0x123457ff;
    const a = encodeKlexel(da, [1], 1), b = encodeKlexel(db, [1], 1);
    expect(changeKey(a)).toBe(changeKey(encodeKlexel(da, [1], 1)));
    expect(changeKey(a)).not.toBe(changeKey(b));
  });

  it('Ebenenname, Farbe oder Frame anders → anderer Schlüssel', () => {
    const a = state();
    const b = state(); b.layers[0].name = 'X';
    const c = state(); c.color = 0x00ff00ff;
    const d = state(); d.fps = a.fps + 1;
    const keys = new Set([a, b, c, d].map(changeKey));
    expect(keys.size).toBe(4);
  });

  it('nur ein Frame-Name anders → anderer Schlüssel', () => {
    const da = new PixelDocument(8, 8), db = new PixelDocument(8, 8);
    db.renameFrame(1, 'Lauf');
    expect(changeKey(encodeKlexel(da, [1], 1))).not.toBe(changeKey(encodeKlexel(db, [1], 1)));
  });
});
