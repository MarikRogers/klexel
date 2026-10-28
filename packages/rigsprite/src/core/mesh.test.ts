import { describe, expect, it } from 'vitest';
import { buildGridMesh, computeWeights, getPartMesh, pointWeights } from './mesh';
import { computeWorldTransforms, type Rig } from './rig';
import { makePart } from '../test/fixtures';
import { RIG_TEMPLATES } from './templates/rigs';

const rig: Rig = {
  bones: [
    { id: 'upper', name: 'upper', parentId: null, x: 0, y: 0, rotation: 0, length: 40, softness: 10 },
    { id: 'lower', name: 'lower', parentId: 'upper', x: 40, y: 0, rotation: 0, length: 40, softness: 10 },
  ],
};
const rest = computeWorldTransforms(rig);
const part = makePart({ id: 'p', imageId: 'i', boneId: 'upper', x: 20, scaleX: 0.5, scaleY: 0.5 });

describe('buildGridMesh', () => {
  const mesh = buildGridMesh(part, { width: 2000, height: 300 }, rig, rest);

  it('grid size is clamped', () => {
    expect(mesh.cols).toBeGreaterThanOrEqual(1);
    expect(mesh.cols).toBeLessThanOrEqual(48);
    expect(mesh.rows).toBeGreaterThanOrEqual(1);
    expect(mesh.rows).toBeLessThanOrEqual(48);
    expect(mesh.indices.length).toBe(mesh.cols * mesh.rows * 6);
    expect(mesh.positions.length).toBe((mesh.cols + 1) * (mesh.rows + 1) * 2);
  });

  it('uvs span 0..1', () => {
    expect(Math.min(...mesh.uvs)).toBe(0);
    expect(Math.max(...mesh.uvs)).toBe(1);
  });
});

describe('pointWeights', () => {
  it('mid-bone vertex is rigid', () => {
    expect(pointWeights({ x: 20, y: 0 }, rig, 'upper', rest).upper).toBeCloseTo(1);
  });

  it('joint point is split evenly', () => {
    const w = pointWeights({ x: 40, y: 0 }, rig, 'upper', rest);
    expect(w.upper).toBeCloseTo(0.5, 6);
    expect(w.lower).toBeCloseTo(0.5, 6);
  });

  it('weights near a joint do not depend on the owning part', () => {
    for (const p of [
      { x: 35, y: 3 },
      { x: 40, y: -8 },
      { x: 46, y: 0 },
    ]) {
      const a = pointWeights(p, rig, 'upper', rest);
      const b = pointWeights(p, rig, 'lower', rest);
      for (const id of ['upper', 'lower']) expect(a[id] ?? 0).toBeCloseTo(b[id] ?? 0, 6);
    }
  });

  it('far vertices are not pulled by unrelated joints', () => {
    const h = RIG_TEMPLATES.find((t) => t.id === 'humanoid')!.rig;
    const w = computeWorldTransforms(h);
    const shoulder = { x: w.upperArm_L[4], y: w.upperArm_L[5] };
    const torsoOrigin = { x: w.torso[4], y: w.torso[5] };
    const d = Math.hypot(torsoOrigin.x - shoulder.x, torsoOrigin.y - shoulder.y);
    const p = {
      x: shoulder.x + ((torsoOrigin.x - shoulder.x) / d) * 20,
      y: shoulder.y + ((torsoOrigin.y - shoulder.y) / d) * 20,
    };
    expect(pointWeights(p, h, 'torso', w).torso).toBeCloseTo(1, 6);
  });
});

describe('computeWeights', () => {
  it('keeps 4 influences summing to 1', () => {
    const mesh = buildGridMesh({ ...part, scaleX: 1, scaleY: 1 }, { width: 90, height: 30 }, rig, rest);
    const wt = computeWeights(mesh.positions, rig, 'upper', rest);
    const n = mesh.positions.length / 2;
    expect(wt.indices.length).toBe(n * 4);
    expect(wt.values.length).toBe(n * 4);
    expect(wt.boneIds).toContain('lower');
    for (let v = 0; v < n; v++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += wt.values[v * 4 + k];
        expect(wt.indices[v * 4 + k]).toBeLessThan(wt.boneIds.length);
      }
      expect(s).toBeCloseTo(1, 5);
    }
  });
});

describe('getPartMesh', () => {
  const size = { width: 90, height: 30 };

  it('returns the cached mesh for the same rig, part and image size', () => {
    const a = getPartMesh(rig, part, size);
    const b = getPartMesh(rig, part, { width: 90, height: 30 });
    expect(b).toBe(a);
    expect(b.mesh).toBe(a.mesh);
    expect(b.weights).toBe(a.weights);
  });

  it('matches an uncached build', () => {
    const { mesh, weights } = getPartMesh(rig, part, size);
    const fresh = buildGridMesh(part, size, rig, rest);
    expect(mesh).toEqual(fresh);
    expect(weights).toEqual(computeWeights(fresh.positions, rig, 'upper', rest));
  });

  it('rebuilds when the part object changes', () => {
    const a = getPartMesh(rig, part, size);
    const moved = { ...part, x: part.x + 5 };
    const b = getPartMesh(rig, moved, size);
    expect(b.mesh).not.toBe(a.mesh);
    expect(b.mesh.positions[0]).toBeCloseTo(a.mesh.positions[0] + 5, 4);
    // An equal-valued but new Part object also rebuilds (identity, not deep equality, is the key).
    expect(getPartMesh(rig, { ...moved }, size).mesh).not.toBe(b.mesh);
  });

  it('keeps only the most recent rig: after switching away the old entries are gone', () => {
    const a = getPartMesh(rig, part, size);
    const other: Rig = { bones: rig.bones.map((b) => ({ ...b })) };
    getPartMesh(other, part, size);
    expect(getPartMesh(rig, part, size).mesh).not.toBe(a.mesh);
  });

  it('rebuilds when the rig object changes (bone rest edit)', () => {
    const a = getPartMesh(rig, part, size);
    const edited: Rig = { bones: rig.bones.map((b) => (b.id === 'upper' ? { ...b, rotation: 90 } : b)) };
    const b = getPartMesh(edited, part, size);
    expect(b.mesh).not.toBe(a.mesh);
    expect(b.mesh.positions).toEqual(buildGridMesh(part, size, edited, computeWorldTransforms(edited)).positions);
    expect(b.mesh.positions).not.toEqual(a.mesh.positions);
  });

  it('rebuilds when the image size changes', () => {
    const a = getPartMesh(rig, part, size);
    const wider = getPartMesh(rig, part, { width: 120, height: 30 });
    expect(wider.mesh).not.toBe(a.mesh);
    expect(wider.mesh).toEqual(buildGridMesh(part, { width: 120, height: 30 }, rig, rest));
    const taller = getPartMesh(rig, part, { width: 120, height: 31 });
    expect(taller.mesh).not.toBe(wider.mesh);
  });

  it('keeps separate entries per part id', () => {
    const other = { ...part, id: 'q', boneId: 'lower' };
    const a = getPartMesh(rig, part, size);
    const b = getPartMesh(rig, other, size);
    expect(b.mesh).not.toBe(a.mesh);
    expect(getPartMesh(rig, part, size)).toBe(a);
    expect(getPartMesh(rig, other, size)).toBe(b);
  });
});
