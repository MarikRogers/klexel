import { describe, expect, it } from 'vitest';
import { identity, type Mat2D } from './math';
import type { Mesh, Weights } from './mesh';
import { skinMatrices, skinVertices } from './skinning';

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
