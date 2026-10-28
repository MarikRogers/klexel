import { expect, test } from 'vitest';
import { angleOf, applyToPoint, DEG2RAD, dist, fromTRS, invert, multiply, normalizeAngle, RAD2DEG, smoothstep, TAU } from './math';

test('fromTRS rotates +x by 90° to +y (clockwise, y-down)', () => {
  const p = applyToPoint(fromTRS(0, 0, 90, 1, 1), { x: 1, y: 0 });
  expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(1);
});
test('multiply applies right operand first', () => {
  const m = multiply(fromTRS(10, 0, 0, 1, 1), fromTRS(0, 0, 0, 2, 2));
  expect(applyToPoint(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 2 });
});
test('invert undoes a TRS', () => {
  const m = fromTRS(5, -3, 37, 2, 0.5);
  const p = applyToPoint(multiply(invert(m), m), { x: 4, y: 7 });
  expect(p.x).toBeCloseTo(4); expect(p.y).toBeCloseTo(7);
});
test('angleOf and normalizeAngle', () => {
  expect(angleOf(fromTRS(0, 0, 135, 1, 1))).toBeCloseTo(135);
  expect(normalizeAngle(270)).toBe(-90);
  expect(normalizeAngle(-180)).toBe(180);
});
test('smoothstep is well-defined for degenerate edges', () => {
  expect(smoothstep(0, 0, -1)).toBe(0); expect(smoothstep(0, 0, 0)).toBe(1); expect(smoothstep(0, 0, 1)).toBe(1);
  expect(smoothstep(1, 0, 0.5)).toBe(0);
});

test('smoothstep', () => {
  expect(smoothstep(-1, 1, -2)).toBe(0); expect(smoothstep(-1, 1, 0)).toBe(0.5); expect(smoothstep(-1, 1, 5)).toBe(1);
});

test('dist is the euclidean distance', () => {
  expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  expect(dist({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
});
test('angle constants are consistent', () => {
  expect(TAU).toBeCloseTo(2 * Math.PI);
  expect(180 * DEG2RAD).toBeCloseTo(Math.PI);
  expect(Math.PI * RAD2DEG).toBeCloseTo(180);
});
