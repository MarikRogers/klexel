import { newId } from './id';
import type { Bone } from './rig';

export interface ImageAsset {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  /** Link to a Klexel frame; `name` = frame name last synced, `missing` = source gone (last pixels kept). */
  source?: ImageSource;
}

export interface ImageSource {
  projectId: string;
  /** Frame id; with `layer` the layer id */
  frameId: number;
  /** Linked per layer (Klexel layer) instead of per frame */
  layer?: true;
  name?: string;
  missing?: true;
}

/** Transform of the image centre in the local space of its bone. */
export interface Part {
  id: string;
  imageId: string;
  boneId: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  z: number;
  visible: boolean;
}

/** Direction the bone runs inside the sprite image (down = top of image at the bone start). */
export type SpriteAxis = 'down' | 'up' | 'right' | 'left';

const AXIS_ROTATION: Record<SpriteAxis, number> = { down: -90, up: 90, right: 0, left: 180 };

/** Sprite axis along the bone, extent along the bone = bone.length * 1.2. */
export function autoFitPart(
  image: { width: number; height: number },
  bone: Bone,
  axis: SpriteAxis = 'down',
): Pick<Part, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'> {
  const extent = axis === 'down' || axis === 'up' ? image.height : image.width;
  const s = (bone.length * 1.2) / Math.max(extent, 1);
  return {
    x: bone.length / 2,
    y: 0,
    rotation: AXIS_ROTATION[axis],
    scaleX: s,
    scaleY: s,
  };
}

/** z for a part placed above all `parts` (0 for none). */
export function nextZ(parts: readonly Part[]): number {
  return parts.reduce((m, x) => Math.max(m, x.z), -1) + 1;
}

/** A new visible part showing `image` on `bone`, auto-fitted along `axis`. */
export function makePart(image: ImageAsset, bone: Bone, axis: SpriteAxis, z: number): Part {
  return {
    id: newId(),
    imageId: image.id,
    boneId: bone.id,
    ...autoFitPart(image, bone, axis),
    z,
    visible: true,
  };
}
