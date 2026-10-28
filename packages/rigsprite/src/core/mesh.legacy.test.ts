import { describe, expect, it } from 'vitest';
import { dist, smoothstep, type Mat2D, type Vec2 } from './math';
import { buildGridMesh, computeWeights, pointWeights, type Weights } from './mesh';
import { autoFitPart } from './part';
import { boneById, boneOrigin, childrenOf, computeWorldTransforms, type Rig } from './rig';
import { makePart } from '../test/fixtures';
import { RIG_TEMPLATES } from './templates/rigs';

// ---- Verbatim copy of the pre-Batch-C implementation (reference for bit-identical results). ----

function legacyDirOf(m: Mat2D): Vec2 {
  const len = Math.hypot(m[0], m[1]) || 1;
  return { x: m[0] / len, y: m[1] / len };
}

interface LegacyJoint {
  J: Vec2;
  r: number;
  dir: Vec2;
  parentSide: string;
  childSide: string;
}

function legacyPointWeights(p: Vec2, rig: Rig, boneId: string, restWorld: Record<string, Mat2D>): Record<string, number> {
  const bone = boneById(rig, boneId);
  if (!bone) throw new Error(`pointWeights: unknown bone ${boneId}`);
  const w: Record<string, number> = { [boneId]: 1 };
  const joints: LegacyJoint[] = [];
  if (bone.parentId !== null) {
    joints.push({
      J: boneOrigin(restWorld[bone.id]),
      r: bone.softness,
      dir: legacyDirOf(restWorld[bone.id]),
      parentSide: bone.parentId,
      childSide: bone.id,
    });
  }
  for (const c of childrenOf(rig, bone.id)) {
    joints.push({
      J: boneOrigin(restWorld[c.id]),
      r: c.softness,
      dir: legacyDirOf(restWorld[c.id]),
      parentSide: bone.id,
      childSide: c.id,
    });
  }
  for (const { J, r, dir, parentSide, childSide } of joints) {
    const dx = p.x - J.x;
    const dy = p.y - J.y;
    const s = dx * dir.x + dy * dir.y;
    const f = smoothstep(-r, r, s);
    const m = 1 - smoothstep(r, 2 * r, dist(p, J));
    if (bone.id === childSide) {
      const t = m * (1 - f);
      w[parentSide] = (w[parentSide] ?? 0) + t;
      w[bone.id] -= t;
    } else {
      const t = m * f;
      w[childSide] = (w[childSide] ?? 0) + t;
      w[bone.id] -= t;
    }
  }
  let sum = 0;
  for (const k of Object.keys(w)) {
    w[k] = Math.max(0, w[k]);
    sum += w[k];
  }
  if (sum <= 0) return { [boneId]: 1 };
  for (const k of Object.keys(w)) w[k] /= sum;
  return w;
}

function legacyComputeWeights(positions: Float32Array, rig: Rig, boneId: string, restWorld: Record<string, Mat2D>): Weights {
  const count = positions.length / 2;
  const perVertex: [string, number][][] = [];
  const used = new Set<string>();
  for (let v = 0; v < count; v++) {
    const w = legacyPointWeights({ x: positions[v * 2], y: positions[v * 2 + 1] }, rig, boneId, restWorld);
    const top = Object.entries(w)
      .filter(([, val]) => val > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = top.reduce((acc, [, val]) => acc + val, 0) || 1;
    const norm = top.map(([id, val]) => [id, val / total] as [string, number]);
    for (const [id] of norm) used.add(id);
    perVertex.push(norm);
  }
  const boneIds = [...used];
  const idx = new Map(boneIds.map((id, i) => [id, i]));
  const indices = new Uint8Array(count * 4);
  const values = new Float32Array(count * 4);
  for (let v = 0; v < count; v++) {
    perVertex[v].forEach(([id, val], k) => {
      indices[v * 4 + k] = idx.get(id) ?? 0;
      values[v * 4 + k] = val;
    });
  }
  return { boneIds, indices, values };
}

// ---- Comparison ----

const bytes = (a: Float32Array | Uint8Array) => Array.from(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));

const humanoid = RIG_TEMPLATES.find((t) => t.id === 'humanoid')!.rig;
const quadruped = RIG_TEMPLATES.find((t) => t.id === 'quadruped')!.rig;
/** Large softness: many joints overlap, so more than 4 candidates compete and ties occur. */
const soft = (rig: Rig, k: number): Rig => ({ bones: rig.bones.map((b) => ({ ...b, softness: b.softness * k })) });
/** Integer-like ids are ordered first by JS object key order; the new code must reproduce that. */
const numericIds: Rig = {
  bones: humanoid.bones.map((b, i) => ({
    ...b,
    id: i % 2 ? String(100 - i) : b.id,
    parentId: b.parentId === null ? null : (() => {
      const pi = humanoid.bones.findIndex((x) => x.id === b.parentId);
      return pi % 2 ? String(100 - pi) : b.parentId;
    })(),
  })),
};

const rigs: [string, Rig][] = [
  ['humanoid', humanoid],
  ['humanoid soft x3', soft(humanoid, 3)],
  ['humanoid softness 0', soft(humanoid, 0)],
  ['quadruped', quadruped],
  ['quadruped soft x4', soft(quadruped, 4)],
  ['numeric ids', numericIds],
];
const images = [
  { width: 20, height: 60 },
  { width: 200, height: 160 },
  { width: 7, height: 300 },
];

describe('pointWeights / computeWeights are bit-identical to the pre-cache implementation', () => {
  for (const [name, rig] of rigs) {
    it(name, () => {
      const rest = computeWorldTransforms(rig);
      let compared = 0;
      for (const bone of rig.bones) {
        for (const image of images) {
          for (const over of [{}, { scaleX: 2, rotation: 30 }, { x: 15, y: -9, scaleY: -1.5 }]) {
            const part = makePart({ boneId: bone.id, ...autoFitPart(image, bone), ...over });
            const mesh = buildGridMesh(part, image, rig, rest);
            const a = legacyComputeWeights(mesh.positions, rig, bone.id, rest);
            const b = computeWeights(mesh.positions, rig, bone.id, rest);
            expect(b.boneIds).toEqual(a.boneIds);
            expect(bytes(b.indices)).toEqual(bytes(a.indices));
            expect(bytes(b.values)).toEqual(bytes(a.values));
            // pointWeights: same keys in the same order with the very same float64 values.
            const pa: string[] = [];
            const pb: string[] = [];
            const asText = (w: Record<string, number>) => Object.entries(w).map(([id, val]) => `${id}=${Object.is(val, -0) ? '-0' : val}`).join(',');
            for (let v = 0; v < mesh.positions.length; v += 6) {
              const p = { x: mesh.positions[v], y: mesh.positions[v + 1] };
              pa.push(asText(legacyPointWeights(p, rig, bone.id, rest)));
              pb.push(asText(pointWeights(p, rig, bone.id, rest)));
            }
            expect(pb).toEqual(pa);
            compared++;
          }
        }
      }
      expect(compared).toBe(rig.bones.length * 9);
    });
  }
});
