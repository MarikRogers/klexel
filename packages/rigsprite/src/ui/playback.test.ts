import { describe, expect, it } from 'vitest';
import { advanceFrame } from './playback';

describe('advanceFrame', () => {
  it('wraps around when looping', () => {
    expect(advanceFrame(23, 24, true)).toEqual({ frame: 0, playing: true });
    expect(advanceFrame(3, 24, true)).toEqual({ frame: 4, playing: true });
  });
  it('stops on the last frame without loop', () => {
    expect(advanceFrame(9, 10, false)).toEqual({ frame: 9, playing: false });
    expect(advanceFrame(3, 10, false)).toEqual({ frame: 4, playing: true });
  });
});
