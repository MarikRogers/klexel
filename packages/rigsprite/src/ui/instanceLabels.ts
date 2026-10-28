import type { Part } from '../core/part';
import { boneById, type Rig } from '../core/rig';

/** Button labels for the instances of one sprite: the bone name, numbered ("Bone", "Bone 2", ...) if several sit on the same bone. */
export function instanceLabels(parts: readonly Part[], rig: Rig): string[] {
  const seen = new Map<string, number>();
  return parts.map((p) => {
    const name = boneById(rig, p.boneId)?.name ?? '?';
    const n = (seen.get(p.boneId) ?? 0) + 1;
    seen.set(p.boneId, n);
    return n === 1 ? name : `${name} ${n}`;
  });
}
