import type { ImageAsset, Part } from '../core/part';

/** A valid image asset; override any field. */
export function makeImageAsset(over: Partial<ImageAsset> = {}): ImageAsset {
  return { id: 'img', name: 'img.png', dataUrl: 'data:image/png;base64,AAAA', width: 20, height: 40, ...over };
}

/** A valid, visible, untransformed part; override any field. */
export function makePart(over: Partial<Part> = {}): Part {
  return {
    id: 'p',
    imageId: 'img',
    boneId: 'bone',
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    z: 0,
    visible: true,
    ...over,
  };
}
