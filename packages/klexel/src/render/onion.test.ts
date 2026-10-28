import { describe, it, expect } from 'vitest';
import { PixelDocument } from '../model/Document';
import { onionFrames, nextPlaybackIndex } from './onion';

function docWithFrames(n: number): PixelDocument {
  const d = new PixelDocument(4, 4);
  for (let i = 1; i < n; i++) d.insertFrame(d.createFrame(), i);
  d.frames.forEach((f, i) => { d.ensureCel(d.layers[0].id, f.id)[0] = (0x10000000 * (i + 1) + 0xff) >>> 0; });
  return d;
}

describe('onionFrames', () => {
  it('null bei ausgeschaltet oder einem Frame', () => {
    const d = docWithFrames(3);
    expect(onionFrames(d)).toBeNull();
    const one = docWithFrames(1); one.onion = true;
    expect(onionFrames(one)).toBeNull();
  });
  it('erster Frame: kein prev', () => {
    const d = docWithFrames(3); d.onion = true; d.setCurrentFrame(d.frames[0].id);
    const o = onionFrames(d)!;
    expect(o.prev).toBeNull();
    expect(o.next).toEqual(d.compositeFrame(d.frames[1].id));
  });
  it('mittlerer Frame: beide', () => {
    const d = docWithFrames(3); d.onion = true; d.setCurrentFrame(d.frames[1].id);
    const o = onionFrames(d)!;
    expect(o.prev).toEqual(d.compositeFrame(d.frames[0].id));
    expect(o.next).toEqual(d.compositeFrame(d.frames[2].id));
  });
  it('letzter Frame: kein next, kein Umlauf', () => {
    const d = docWithFrames(3); d.onion = true; d.setCurrentFrame(d.frames[2].id);
    const o = onionFrames(d)!;
    expect(o.next).toBeNull();
    expect(o.prev).toEqual(d.compositeFrame(d.frames[1].id));
  });
});

describe('nextPlaybackIndex', () => {
  it('läuft im Kreis', () => {
    expect(nextPlaybackIndex(2, 3)).toBe(0);
    expect(nextPlaybackIndex(0, 3)).toBe(1);
  });
  it('bleibt im Bereich bei veralteten Indizes', () => {
    const r = nextPlaybackIndex(5, 3);
    expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(3);
  });
  it('count 0 -> 0', () => { expect(nextPlaybackIndex(4, 0)).toBe(0); });
});
