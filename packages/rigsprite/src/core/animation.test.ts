import { describe, expect, test } from 'vitest';
import {
  channelDefault,
  createAnimation,
  keyedFrames,
  moveBoneKeys,
  removeBoneKeysAt,
  sampleAnimation,
  sampleChannel,
  sanitizeAnimationPatch,
  setKey,
  setKeyEasing,
  type Easing,
} from './animation';

const k = (frame: number, value: number, easing: Easing = 'linear') => ({ frame, value, easing });

describe('sampleChannel', () => {
  test('no keys -> default', () => expect(sampleChannel([], 3, 1)).toBe(1));
  test('before first / after last key clamps', () => {
    expect(sampleChannel([k(4, 10), k(8, 20)], 0, 0)).toBe(10);
    expect(sampleChannel([k(4, 10), k(8, 20)], 99, 0)).toBe(20);
  });
  test('linear midpoint', () => expect(sampleChannel([k(0, 0), k(10, 100)], 5, 0)).toBe(50));
  test('step holds', () => expect(sampleChannel([k(0, 0, 'step'), k(10, 100)], 9, 0)).toBe(0));
  test('easeInOut is symmetric and slow at ends', () => {
    const keys = [k(0, 0, 'easeInOut'), k(10, 100)];
    expect(sampleChannel(keys, 5, 0)).toBeCloseTo(50);
    expect(sampleChannel(keys, 1, 0)).toBeLessThan(10);
  });
  test('rotation interpolates linearly without wrap', () => {
    expect(sampleChannel([k(0, 0), k(10, 360)], 5, 0)).toBe(180);
  });
});

describe('editing', () => {
  test('setKey replaces same frame and keeps order', () => {
    let a = createAnimation('t');
    a = setKey(a, 'arm', 'rotation', k(10, 5));
    a = setKey(a, 'arm', 'rotation', k(2, 1));
    a = setKey(a, 'arm', 'rotation', k(10, 7));
    expect(a.tracks.arm.rotation!.map((x) => [x.frame, x.value])).toEqual([
      [2, 1],
      [10, 7],
    ]);
  });
  test('setKey does not mutate input', () => {
    const a = createAnimation('t');
    setKey(a, 'arm', 'rotation', k(1, 1));
    expect(a.tracks).toEqual({});
  });
  test('removeBoneKeysAt removes all channels at frame', () => {
    let a = setKey(createAnimation('t'), 'arm', 'rotation', k(2, 1));
    a = setKey(a, 'arm', 'x', k(2, 3));
    a = setKey(a, 'arm', 'x', k(5, 3));
    a = removeBoneKeysAt(a, 'arm', 2);
    expect(keyedFrames(a, 'arm')).toEqual([5]);
  });
  test('moveBoneKeys moves all channels and overwrites target', () => {
    let a = createAnimation('t');
    a = setKey(a, 'arm', 'rotation', k(2, 10));
    a = setKey(a, 'arm', 'x', k(2, 20));
    a = setKey(a, 'arm', 'rotation', k(6, 99));
    a = moveBoneKeys(a, 'arm', 2, 6);
    expect(a.tracks.arm.rotation!.map((x) => [x.frame, x.value])).toEqual([[6, 10]]);
    expect(a.tracks.arm.x!.map((x) => [x.frame, x.value])).toEqual([[6, 20]]);
    expect(keyedFrames(a, 'arm')).toEqual([6]);
  });
  test('keyedFrames is sorted and unique', () => {
    let a = setKey(createAnimation('t'), 'arm', 'rotation', k(8, 1));
    a = setKey(a, 'arm', 'x', k(3, 1));
    a = setKey(a, 'arm', 'y', k(8, 1));
    expect(keyedFrames(a, 'arm')).toEqual([3, 8]);
    expect(keyedFrames(a, 'none')).toEqual([]);
  });
});

describe('sampleAnimation', () => {
  test('fills only keyed channels', () => {
    const a = setKey(createAnimation('t'), 'arm', 'rotation', k(0, 30));
    expect(sampleAnimation(a, 0)).toEqual({ arm: { rotation: 30 } });
  });
});

describe('setKeyEasing', () => {
  const base = () => {
    let a = createAnimation('a');
    a = setKey(a, 'b', 'rotation', { frame: 2, value: 1, easing: 'linear' });
    a = setKey(a, 'b', 'x', { frame: 2, value: 5, easing: 'linear' });
    return setKey(a, 'b', 'x', { frame: 4, value: 6, easing: 'linear' });
  };

  test('sets the easing of all channel keys at the frame', () => {
    const a = base();
    const next = setKeyEasing(a, 'b', 2, 'step');
    expect(next.tracks.b.rotation).toEqual([{ frame: 2, value: 1, easing: 'step' }]);
    expect(next.tracks.b.x).toEqual([
      { frame: 2, value: 5, easing: 'step' },
      { frame: 4, value: 6, easing: 'linear' },
    ]);
    expect(a.tracks.b.x![0].easing).toBe('linear');
  });

  test('returns the same animation when nothing changes', () => {
    const a = base();
    expect(setKeyEasing(a, 'b', 2, 'linear')).toBe(a);
    expect(setKeyEasing(a, 'b', 3, 'step')).toBe(a);
    expect(setKeyEasing(a, 'missing', 2, 'step')).toBe(a);
  });
});

describe('sanitizeAnimationPatch', () => {
  test('clamps fps and length, passes other fields', () => {
    expect(sanitizeAnimationPatch({ fps: 0, length: -3, name: 'x', loop: false })).toEqual({
      fps: 1,
      length: 1,
      name: 'x',
      loop: false,
    });
    expect(sanitizeAnimationPatch({ fps: 500 })).toEqual({ fps: 120 });
    expect(sanitizeAnimationPatch({ fps: 24, length: 30 })).toEqual({ fps: 24, length: 30 });
    expect(sanitizeAnimationPatch({ name: 'n' })).toEqual({ name: 'n' });
  });
});

describe('depth channels', () => {
  const anim = () => createAnimation('t');

  test('tilt, turn and depth default to 0 and are sampled like other channels', () => {
    expect(channelDefault('tilt')).toBe(0);
    expect(channelDefault('turn')).toBe(0);
    expect(channelDefault('depth')).toBe(0);
    let a = setKey(anim(), 'b', 'tilt', { frame: 0, value: 0, easing: 'linear' });
    a = setKey(a, 'b', 'tilt', { frame: 10, value: 40, easing: 'linear' });
    expect(sampleAnimation(a, 5).b).toEqual({ tilt: 20 });
  });

  test('key editing handles the new channels', () => {
    let a = setKey(anim(), 'b', 'depth', { frame: 2, value: 5, easing: 'linear' });
    a = setKey(a, 'b', 'rotation', { frame: 2, value: 1, easing: 'linear' });
    expect(keyedFrames(a, 'b')).toEqual([2]);
    const moved = moveBoneKeys(a, 'b', 2, 6);
    expect(moved.tracks.b.depth).toEqual([{ frame: 6, value: 5, easing: 'linear' }]);
    expect(moved.tracks.b.rotation![0].frame).toBe(6);
    expect(removeBoneKeysAt(a, 'b', 2).tracks.b).toBeUndefined();
    expect(setKeyEasing(a, 'b', 2, 'step').tracks.b.depth![0].easing).toBe('step');
  });
});
