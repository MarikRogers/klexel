import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageCache, type ImageTarget } from './imageCache';

interface FakeImage {
  src: string;
  onload: (() => void) | null;
}

let made: FakeImage[];
let target: { [K in keyof ImageTarget]: ReturnType<typeof vi.fn> };
let onLoaded: ReturnType<typeof vi.fn>;
const createImage = () => {
  const img: FakeImage = { src: '', onload: null };
  made.push(img);
  return img as unknown as HTMLImageElement;
};
const make = () => createImageCache(target as unknown as ImageTarget, onLoaded, createImage);

beforeEach(() => {
  made = [];
  target = { setImage: vi.fn(), setFilter: vi.fn(), removeImage: vi.fn() };
  onLoaded = vi.fn();
});

describe('createImageCache', () => {
  it('decodes new images and uploads them once loaded', () => {
    const cache = make();
    cache.sync({ a: { dataUrl: 'data:a' } }, true);
    expect(made).toHaveLength(1);
    expect(made[0].src).toBe('data:a');
    expect(target.setImage).not.toHaveBeenCalled();
    made[0].onload!();
    expect(target.setImage).toHaveBeenCalledWith('a', made[0], true);
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('does nothing while images and pixelArt are unchanged', () => {
    const cache = make();
    const images = { a: { dataUrl: 'data:a' } };
    cache.sync(images, false);
    cache.sync(images, false);
    expect(made).toHaveLength(1);
  });

  it('re-decodes changed data URLs and drops removed images', () => {
    const cache = make();
    cache.sync({ a: { dataUrl: 'data:a' }, b: { dataUrl: 'data:b' } }, false);
    cache.sync({ a: { dataUrl: 'data:a2' } }, false);
    expect(target.removeImage.mock.calls).toEqual([['a'], ['b']]);
    expect(made.map((m) => m.src)).toEqual(['data:a', 'data:b', 'data:a2']);
    // The stale load of the old 'a' is ignored.
    made[0].onload!();
    expect(target.setImage).not.toHaveBeenCalled();
  });

  it('a Pixel-Art toggle only switches the filter of loaded images', () => {
    const cache = make();
    const images = { a: { dataUrl: 'data:a' }, b: { dataUrl: 'data:b' } };
    cache.sync(images, false);
    made[0].onload!();
    cache.sync(images, true);
    expect(target.setFilter.mock.calls).toEqual([['a', true]]);
    expect(made).toHaveLength(2);
    made[1].onload!();
    expect(target.setImage).toHaveBeenLastCalledWith('b', made[1], true);
  });

  it('ignores loads after dispose', () => {
    const cache = make();
    cache.sync({ a: { dataUrl: 'data:a' } }, false);
    cache.dispose();
    made[0].onload!();
    expect(target.setImage).not.toHaveBeenCalled();
    expect(onLoaded).not.toHaveBeenCalled();
  });
});
