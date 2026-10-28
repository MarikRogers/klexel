import { describe, expect, it } from 'vitest';
import { fromTRS } from './math';
import { applyToPoint3, embed2D, fromBone3D, identity3, multiply3, projectTo2D, type Mat3D } from './math3d';

const flat = { z: 0, tilt: 0, turn: 0, scaleX: 1, scaleY: 1 };

describe('math3d', () => {
  it('multiply3 with identity returns the other matrix', () => {
    const m = fromBone3D({ ...flat, x: 3, y: 4, rotation: 25, tilt: 30, turn: 10 });
    expect(multiply3(identity3(), m)).toEqual(m);
    expect(multiply3(m, identity3())).toEqual(m);
  });

  it('without tilt, turn and depth fromBone3D equals the embedded 2D matrix bit for bit', () => {
    for (const r of [0, 37, 90, -120]) {
      expect(fromBone3D({ ...flat, x: 3, y: 4, rotation: r, scaleX: 1.5, scaleY: 0.5 })).toEqual(
        embed2D(fromTRS(3, 4, r, 1.5, 0.5)),
      );
    }
  });

  it('projectTo2D undoes embed2D', () => {
    const m = fromTRS(3, 4, 33, 2, 1);
    expect(projectTo2D(embed2D(m))).toEqual(m);
  });

  it('tilt swings the bone tip towards the camera: a downward bone gets shorter and its tip comes forward', () => {
    const m = fromBone3D({ ...flat, x: 0, y: 0, rotation: 90, tilt: 60 });
    const tip = applyToPoint3(m, { x: 10, y: 0, z: 0 });
    expect(tip.x).toBeCloseTo(0, 9);
    expect(tip.y).toBeCloseTo(5, 9);
    expect(tip.z).toBeCloseTo(10 * Math.sin((60 * Math.PI) / 180), 9);
  });

  it('turn twists around the bone axis: the local +y side comes forward', () => {
    const m = fromBone3D({ ...flat, x: 0, y: 0, rotation: 0, turn: 60 });
    const p = applyToPoint3(m, { x: 0, y: 10, z: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(5, 9);
    expect(p.z).toBeCloseTo(10 * Math.sin((60 * Math.PI) / 180), 9);
  });

  it('depth moves along z', () => {
    const m = fromBone3D({ ...flat, x: 1, y: 2, z: 7, rotation: 0 });
    expect(applyToPoint3(m, { x: 0, y: 0, z: 0 })).toEqual({ x: 1, y: 2, z: 7 });
  });

  it('limits tilt and turn to 85 degrees: no NaN and a projectable, invertible 2D part', () => {
    const m = fromBone3D({ ...flat, x: 0, y: 0, rotation: 0, tilt: 200, turn: -200 });
    expect(m.every(Number.isFinite)).toBe(true);
    const [a, b, c, d] = projectTo2D(m);
    expect(Math.abs(a * d - b * c)).toBeGreaterThan(1e-3);
    expect(m).toEqual(fromBone3D({ ...flat, x: 0, y: 0, rotation: 0, tilt: 85, turn: -85 }) as Mat3D);
  });
});
