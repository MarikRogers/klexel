import { describe, expect, it } from 'vitest';
import { identity, type Mat2D } from './math';
import type { Mesh, Weights } from './mesh';
import { embed2D, fromBone3D } from './math3d';
import { skinMatrices, skinMatrices3D, skinVertices, skinVertices3D } from './skinning';

describe('skinning', () => {
  it('rest pose returns rest positions', () => {
    const rest: Record<string, Mat2D> = { a: [1, 0, 0, 1, 5, 7], b: [0, 1, -1, 0, 20, 3] };
    const skin = skinMatrices(rest, rest);
    for (const m of Object.values(skin)) m.forEach((v, i) => expect(v).toBeCloseTo(identity()[i], 5));
    const mesh: Mesh = {
      positions: new Float32Array([1, 2, 30, -4]),
      uvs: new Float32Array(),
      indices: new Uint16Array(),
      cols: 1,
      rows: 1,
    };
    const weights: Weights = {
      boneIds: ['a', 'b'],
      indices: new Uint8Array([0, 1, 0, 0, 1, 0, 0, 0]),
      values: new Float32Array([0.4, 0.6, 0, 0, 1, 0, 0, 0]),
    };
    const out = skinVertices(mesh, weights, skin);
    mesh.positions.forEach((v, i) => expect(out[i]).toBeCloseTo(v, 4));
  });
});

describe('skinning in 3D', () => {
  const mesh: Mesh = {
    positions: new Float32Array([1, 2, 30, -4, 0, 10]),
    uvs: new Float32Array(),
    indices: new Uint16Array(),
    cols: 1,
    rows: 1,
  };
  const oneBone = (): Weights => ({
    boneIds: ['a'],
    indices: new Uint8Array(12),
    values: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
  });
  const flat = { z: 0, tilt: 0, turn: 0, scaleX: 1, scaleY: 1, rotation: 0 };

  it('a flat skin gives the 2D positions and depth 0', () => {
    const rest: Record<string, Mat2D> = { a: [1, 0, 0, 1, 5, 7] };
    const inv: Record<string, Mat2D> = { a: [1, 0, 0, 1, -5, -7] };
    const skin = skinMatrices3D(inv, { a: embed2D([0, 1, -1, 0, 9, 9]) });
    const out = skinVertices3D(mesh, oneBone(), skin);
    const ref = skinVertices(mesh, oneBone(), skinMatrices(rest, { a: [0, 1, -1, 0, 9, 9] }, inv));
    expect(Array.from(out.positions)).toEqual(Array.from(ref));
    expect(out.depth).toBe(0);
  });

  it('depth is the mean z of the skinned vertices', () => {
    const pose = fromBone3D({ ...flat, x: 0, y: 0, z: 6 });
    const skin = skinMatrices3D({ a: [1, 0, 0, 1, 0, 0] }, { a: pose });
    expect(skinVertices3D(mesh, oneBone(), skin).depth).toBeCloseTo(6, 5);
  });

  it('a tilted bone shrinks the projection and puts the far end forward', () => {
    const pose = fromBone3D({ ...flat, x: 0, y: 0, tilt: 60 });
    const skin = skinMatrices3D({ a: [1, 0, 0, 1, 0, 0] }, { a: pose });
    const out = skinVertices3D(mesh, oneBone(), skin);
    expect(out.positions[2]).toBeCloseTo(30 * 0.5, 4);
    expect(out.depth).toBeGreaterThan(0);
  });
});
