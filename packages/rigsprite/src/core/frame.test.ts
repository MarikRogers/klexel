import { describe, expect, it } from 'vitest';
import type { Animation } from './animation';
import { buildFrame, type FrameInput } from './frame';
import { applyToPoint, dist } from './math';
import { buildGridMesh, computeWeights, type Mesh } from './mesh';
import { autoFitPart, type Part } from './part';
import { boneOrigin, computeWorldTransforms, type Pose } from './rig';
import { makePart as fixturePart } from '../test/fixtures';
import { skinMatrices, skinVertices } from './skinning';
import { RIG_TEMPLATES } from './templates/rigs';

const rig = RIG_TEMPLATES.find((t) => t.id === 'humanoid')!.rig;
const image = { width: 20, height: 60 };

function makePart(id: string, boneId: string, over: Partial<Part> = {}): Part {
  const bone = rig.bones.find((b) => b.id === boneId)!;
  return fixturePart({ id, imageId: 'img', boneId, ...autoFitPart(image, bone), ...over });
}

function input(parts: Part[], animation: Animation | null = null): FrameInput {
  return { rig, parts, images: { img: image }, animation };
}

function anim(tracks: Animation['tracks']): Animation {
  return { id: 'a', name: 'a', fps: 12, length: 10, loop: true, tracks };
}

describe('buildFrame', () => {
  it('softness 0 yields no NaN positions', () => {
    const soft = { ...rig, bones: rig.bones.map((b) => (b.id === 'lowerArm_L' ? { ...b, softness: 0 } : b)) };
    const parts = [makePart('up', 'upperArm_L')];
    const frame = buildFrame({ rig: soft, parts, images: { img: image }, animation: null }, 0, { lowerArm_L: { rotation: 90 } });
    expect(frame.items).toHaveLength(1);
    for (const v of frame.items[0].positions) expect(Number.isNaN(v)).toBe(false);
  });

  it('elbow stays closed at extreme angles', () => {
    const parts = [makePart('up', 'upperArm_L'), makePart('low', 'lowerArm_L')];
    const rest = computeWorldTransforms(rig);
    const elbow = boneOrigin(rest['lowerArm_L']);
    const pos = new Float32Array([elbow.x, elbow.y]);
    const mesh: Mesh = { positions: pos, uvs: new Float32Array(), indices: new Uint16Array(), cols: 1, rows: 1 };
    for (const rotation of [-170, -90, 45, 170]) {
      for (const scaleX of [0.2, 1, 3]) {
        const extra: Pose = { lowerArm_L: { rotation }, upperArm_L: { scaleX } };
        const frame = buildFrame(input(parts), 0, extra);
        expect(frame.items).toHaveLength(2);
        for (const item of frame.items) {
          for (const v of item.positions) expect(Number.isNaN(v)).toBe(false);
        }
        const skin = skinMatrices(rest, frame.world);
        const a = skinVertices(mesh, computeWeights(pos, rig, 'upperArm_L', rest), skin);
        const b = skinVertices(mesh, computeWeights(pos, rig, 'lowerArm_L', rest), skin);
        expect(a[0]).toBeCloseTo(b[0], 4);
        expect(a[1]).toBeCloseTo(b[1], 4);
      }
    }
  });

  it('items are z-sorted and skip invisible/broken parts', () => {
    const parts = [
      makePart('p2', 'upperArm_L', { z: 2 }),
      makePart('p0', 'upperArm_L', { z: 0 }),
      makePart('p1', 'lowerArm_L', { z: 1 }),
      makePart('hidden', 'upperArm_L', { visible: false }),
      makePart('broken', 'upperArm_L', { boneId: 'ghost' }),
      makePart('noimg', 'upperArm_L', { imageId: 'missing' }),
    ];
    const { items } = buildFrame(input(parts), 0);
    expect(items.map((i) => i.partId)).toEqual(['p0', 'p1', 'p2']);
  });

  it('animation tracks for deleted bones are ignored', () => {
    const a = anim({ ghost: { rotation: [{ frame: 0, value: 30, easing: 'linear' }] } });
    expect(() => buildFrame(input([makePart('p', 'upperArm_L')], a), 3)).not.toThrow();
  });

  it('extraPose overrides the animation pose per channel', () => {
    const a = anim({ lowerArm_L: { rotation: [{ frame: 0, value: 30, easing: 'linear' }] } });
    const rest = computeWorldTransforms(rig);
    const tip = { x: 5, y: 0 };
    const sampled = applyToPoint(buildFrame(input([], a), 0).world['lowerArm_L'], tip);
    const over = applyToPoint(buildFrame(input([], a), 0, { lowerArm_L: { rotation: 0 } }).world['lowerArm_L'], tip);
    expect(over.y).toBeCloseTo(applyToPoint(rest['lowerArm_L'], tip).y, 4);
    expect(sampled.y).not.toBeCloseTo(over.y, 2);
  });

  describe('mesh cache', () => {
    const parts = [makePart('up', 'upperArm_L'), makePart('low', 'lowerArm_L')];
    const byId = (f: ReturnType<typeof buildFrame>, id: string) => f.items.find((i) => i.partId === id)!;
    const vertex = (f: ReturnType<typeof buildFrame>, id: string, v: number) => {
      const p = byId(f, id).positions;
      return { x: p[v * 2], y: p[v * 2 + 1] };
    };

    it('reuses the rest mesh across frames for the same rig and parts', () => {
      const a = buildFrame(input(parts), 0);
      const b = buildFrame(input(parts), 0, { lowerArm_L: { rotation: 40 } });
      for (const id of ['up', 'low']) {
        expect(byId(b, id).uvs).toBe(byId(a, id).uvs);
        expect(byId(b, id).indices).toBe(byId(a, id).indices);
      }
      // Skinned positions are per frame.
      expect(byId(b, 'low').positions).not.toBe(byId(a, 'low').positions);
      expect(byId(b, 'low').positions).not.toEqual(byId(a, 'low').positions);
    });

    it('rebuilds only the edited part (new Part object)', () => {
      const a = buildFrame(input(parts), 0);
      const moved = [{ ...parts[0], x: parts[0].x + 4 }, parts[1]];
      const b = buildFrame(input(moved), 0);
      expect(byId(b, 'up').uvs).not.toBe(byId(a, 'up').uvs);
      expect(dist(vertex(b, 'up', 0), vertex(a, 'up', 0))).toBeCloseTo(4, 3);
      expect(byId(b, 'low').uvs).toBe(byId(a, 'low').uvs);
    });

    it('rebuilds after a bone rest change (new Rig object) and never returns stale geometry', () => {
      const a = buildFrame(input(parts), 0);
      const moved: typeof rig = { bones: rig.bones.map((b) => (b.id === 'torso' ? { ...b, x: b.x + 10 } : b)) };
      const b = buildFrame({ rig: moved, parts, images: { img: image }, animation: null }, 0);
      for (const id of ['up', 'low']) expect(byId(b, id).uvs).not.toBe(byId(a, id).uvs);
      // Same as an uncached computation on the edited rig.
      const rest = computeWorldTransforms(moved);
      const mesh = buildGridMesh(parts[0], image, moved, rest);
      const expected = skinVertices(mesh, computeWeights(mesh.positions, moved, 'upperArm_L', rest), skinMatrices(rest, b.world));
      expect(Array.from(byId(b, 'up').positions)).toEqual(Array.from(expected));
    });

    it('rebuilds when the image size changes', () => {
      const a = buildFrame(input(parts), 0);
      const b = buildFrame({ rig, parts, images: { img: { width: 40, height: 60 } }, animation: null }, 0);
      expect(byId(b, 'up').uvs).not.toBe(byId(a, 'up').uvs);
      expect(byId(b, 'up').positions).not.toEqual(byId(a, 'up').positions);
      const c = buildFrame({ rig, parts, images: { img: { width: 40, height: 60 } }, animation: null }, 0);
      expect(byId(c, 'up').uvs).toBe(byId(b, 'up').uvs);
    });
  });
});
