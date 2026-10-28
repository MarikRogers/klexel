import { makePart, nextZ, autoFitPart, type ImageAsset, type SpriteAxis } from './part';
import { matchBoneByFilename, type Project } from './project';
import { boneById, descendantIds } from './rig';

/** Adds `images`; each image whose file name matches a bone is attached to it as a new part on top. */
export function addImagesAutoAttach(p: Project, images: readonly ImageAsset[]): Project {
  const imgs = { ...p.images };
  const parts = [...p.parts];
  for (const image of images) {
    imgs[image.id] = image;
    const bone = matchBoneByFilename(image.name, p.rig.bones);
    if (bone) parts.push(makePart(image, bone, p.settings.spriteAxis, nextZ(parts)));
  }
  return { ...p, images: imgs, parts };
}

/**
 * Removes a bone with all its descendants, their parts and animation tracks.
 * Returns `p` itself for an unknown id or the root bone.
 */
export function removeBoneCascade(p: Project, id: string): Project {
  const target = boneById(p.rig, id);
  if (!target || target.parentId === null) return p;
  const gone = new Set([id, ...descendantIds(p.rig, id)]);
  return {
    ...p,
    rig: { bones: p.rig.bones.filter((b) => !gone.has(b.id)) },
    parts: p.parts.filter((x) => !gone.has(x.boneId)),
    animations: p.animations.map((a) => ({
      ...a,
      tracks: Object.fromEntries(Object.entries(a.tracks).filter(([bid]) => !gone.has(bid))),
    })),
  };
}

/** Switches the sprite axis and refits every part (z and visibility kept); `p` itself if unchanged. */
export function withSpriteAxis(p: Project, axis: SpriteAxis): Project {
  if (p.settings.spriteAxis === axis) return p;
  const parts = p.parts.map((part) => {
    const image = p.images[part.imageId];
    const bone = boneById(p.rig, part.boneId);
    return image && bone ? { ...part, ...autoFitPart(image, bone, axis) } : part;
  });
  return { ...p, parts, settings: { ...p.settings, spriteAxis: axis } };
}
