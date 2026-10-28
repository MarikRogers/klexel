import { describe, it, expect } from 'vitest';
import { snapshotKey } from './snapshotKey';
import { PixelDocument, encodeKlexel } from '@suite/klexel';

const state = () => encodeKlexel(new PixelDocument(8, 8), [0xff0000ff, 0x00ff00ff], 0xff0000ff);

describe('snapshotKey', () => {
  it('gleicher Inhalt → gleicher Schlüssel', () => {
    expect(snapshotKey(state())).toBe(snapshotKey(state()));
  });

  it('ein Pixel anders → anderer Schlüssel', () => {
    const da = new PixelDocument(8, 8), db = new PixelDocument(8, 8);
    da.data[5] = 0x123456ff; db.data[5] = 0x123457ff;
    const a = encodeKlexel(da, [1], 1), b = encodeKlexel(db, [1], 1);
    expect(snapshotKey(a)).toBe(snapshotKey(encodeKlexel(da, [1], 1)));
    expect(snapshotKey(a)).not.toBe(snapshotKey(b));
  });

  it('Ebenenname, Farbe oder Frame anders → anderer Schlüssel', () => {
    const a = state();
    const b = state(); b.layers[0].name = 'X';
    const c = state(); c.color = 0x00ff00ff;
    const d = state(); d.fps = a.fps + 1;
    const keys = new Set([a, b, c, d].map(snapshotKey));
    expect(keys.size).toBe(4);
  });
});
