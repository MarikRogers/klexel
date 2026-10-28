import type { DrawItem } from '../core/frame';
import { clamp, dist, type Mat2D, type Vec2 } from '../core/math';
import { boneOrigin, boneTip, type Rig } from '../core/rig';
import type { Layer } from '../render/layers';
import { screenToWorld, type ViewTransform } from '../render/view';

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Bone whose segment (origin → tip) is nearest to `p`, if within `tolerance`. */
export function hitTestBone(rig: Rig, world: Record<string, Mat2D>, p: Vec2, tolerance: number): string | null {
  let best: string | null = null;
  let bestDist = tolerance;
  for (const bone of rig.bones) {
    const m = world[bone.id];
    if (!m) continue;
    // A thick bone is grabbed anywhere on its body, not only near the centre line
    const d = Math.max(0, distToSegment(p, boneOrigin(m), boneTip(m, bone)) - (bone.thickness ?? 0) / 2);
    if (d <= bestDist) {
      best = bone.id;
      bestDist = d;
    }
  }
  return best;
}

function inTriangle(p: Vec2, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const d1 = (p.x - bx) * (ay - by) - (ax - bx) * (p.y - by);
  const d2 = (p.x - cx) * (by - cy) - (bx - cx) * (p.y - cy);
  const d3 = (p.x - ax) * (cy - ay) - (cx - ax) * (p.y - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function containsPoint(item: DrawItem, p: Vec2): boolean {
  const { positions: v, indices: idx } = item;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 2;
    const b = idx[i + 1] * 2;
    const c = idx[i + 2] * 2;
    if (inTriangle(p, v[a], v[a + 1], v[b], v[b + 1], v[c], v[c + 1])) return true;
  }
  return false;
}

/**
 * Part under screen point `p`: the pointer is projected back onto each layer's depth; the hit drawn
 * last (draw order of `layers`, see orderLayers) is the one seen on top and wins.
 */
export function hitTestPart(layers: Layer[], view: ViewTransform, p: Vec2): string | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const { item, depth } = layers[i];
    if (containsPoint(item, screenToWorld(view, p, depth))) return item.partId;
  }
  return null;
}
