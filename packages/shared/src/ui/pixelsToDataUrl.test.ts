import { describe, it, expect } from 'vitest';
import { pixelsToRgba, pixelsToDataUrl } from './pixelsToDataUrl';

describe('pixelsToRgba', () => {
  it('packt 0xRRGGBBAA als Bytes R,G,B,A', () => {
    expect([...pixelsToRgba(new Uint32Array([0x11223344, 0xff000080, 0]))]).toEqual([0x11, 0x22, 0x33, 0x44, 255, 0, 0, 0x80, 0, 0, 0, 0]);
  });
});

describe('pixelsToDataUrl Validierung', () => {
  it('wirft RangeError vor dem Canvas', () => {
    expect(() => pixelsToDataUrl(0, 1, new Uint32Array(0))).toThrow(RangeError);
    expect(() => pixelsToDataUrl(2, -1, new Uint32Array(0))).toThrow(RangeError);
    expect(() => pixelsToDataUrl(2, 2, new Uint32Array(3))).toThrow(RangeError);
  });
});
