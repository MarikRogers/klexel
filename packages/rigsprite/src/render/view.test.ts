import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../core/math';
import {
  axisScale,
  depthOffset,
  followCameraPan,
  isBackView,
  MIN_AXIS_SCALE,
  pinchView,
  rotatePanAroundCenter,
  screenToWorld,
  viewMatrix,
  worldToScreen,
  type CameraAngles,
  type ViewTransform,
} from './view';

const base = { x: 13, y: -7, yaw: 0, pitch: 0, mirror: false, width: 800, height: 600 };

describe('view transform', () => {
  for (const rotation of [0, 37, 90, -135, 180]) {
    for (const zoom of [0.5, 2]) {
      it(`screenToWorld inverts worldToScreen (rotation ${rotation}, zoom ${zoom})`, () => {
        const view: ViewTransform = { ...base, zoom, rotation };
        for (const p of [{ x: 0, y: 0 }, { x: 12.5, y: -40 }, { x: -300, y: 77 }]) {
          const back = screenToWorld(view, worldToScreen(view, p));
          expect(back.x).toBeCloseTo(p.x, 6);
          expect(back.y).toBeCloseTo(p.y, 6);
        }
      });
    }
  }

  it('rotation 90 maps world (+1, 0) to screen (0, +zoom) relative to the centre', () => {
    const view: ViewTransform = { ...base, x: 0, y: 0, zoom: 2, rotation: 90 };
    const s = worldToScreen(view, { x: 1, y: 0 });
    expect(s.x - 400).toBeCloseTo(0, 9);
    expect(s.y - 300).toBeCloseTo(2, 9);
  });

  it('rotation 0 keeps the old mapping', () => {
    const view: ViewTransform = { ...base, zoom: 2, rotation: 0 };
    expect(worldToScreen(view, { x: 3, y: 4 })).toEqual({ x: 6 + 400 + 13, y: 8 + 300 - 7 });
  });
});

describe('orbit camera', () => {
  const center = { x: 0, y: 0, zoom: 1, width: 0, height: 0 };
  const orbit = (yaw: number, pitch: number, extra: Partial<ViewTransform> = {}): ViewTransform => ({
    ...base,
    ...center,
    rotation: 0,
    yaw,
    pitch,
    ...extra,
  });

  for (const yaw of [0, 30, 90, 135, 180, -60]) {
    for (const pitch of [0, 45, 90, -90]) {
      for (const mirror of [false, true]) {
        for (const rotation of [0, 37]) {
          it(`screenToWorld inverts worldToScreen (yaw ${yaw}, pitch ${pitch}, mirror ${mirror}, roll ${rotation})`, () => {
            const view: ViewTransform = { ...base, zoom: 1.5, rotation, yaw, pitch, mirror };
            for (const depth of [0, -18, 24]) {
              for (const p of [{ x: 0, y: 0 }, { x: 12.5, y: -40 }, { x: -300, y: 77 }]) {
                const s = worldToScreen(view, p, depth);
                expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
                const back = screenToWorld(view, s, depth);
                expect(back.x).toBeCloseTo(p.x, 6);
                expect(back.y).toBeCloseTo(p.y, 6);
              }
            }
          });
        }
      }
    }
  }

  it('yaw 90 squeezes x to MIN_AXIS_SCALE and moves nearer layers left', () => {
    const view = orbit(90, 0);
    const s0 = worldToScreen(view, { x: 10, y: 0 });
    expect(s0.x).toBeCloseTo(10 * 0.05, 9);
    expect(s0.y).toBeCloseTo(0, 9);
    const s24 = worldToScreen(view, { x: 10, y: 0 }, 24);
    expect(s24.x - s0.x).toBeCloseTo(-24, 9);
    expect(s24.y - s0.y).toBeCloseTo(0, 9);
  });

  it('pitch 90 squeezes y to MIN_AXIS_SCALE and moves nearer layers down', () => {
    const view = orbit(0, 90);
    const s0 = worldToScreen(view, { x: 0, y: 50 });
    expect(s0.x).toBeCloseTo(0, 9);
    expect(s0.y).toBeCloseTo(50 * 0.05, 9);
    const s24 = worldToScreen(view, { x: 0, y: 50 }, 24);
    expect(s24.x - s0.x).toBeCloseTo(0, 9);
    expect(s24.y - s0.y).toBeCloseTo(24, 9);
  });

  it('follows the spec projection (then mirror, roll, zoom, pan)', () => {
    const [yaw, pitch, d] = [30, 45, 7];
    const p = { x: 11, y: -5 };
    const cg = Math.cos((yaw * Math.PI) / 180);
    const sg = Math.sin((yaw * Math.PI) / 180);
    const cn = Math.cos((pitch * Math.PI) / 180);
    const sn = Math.sin((pitch * Math.PI) / 180);
    const xp = p.x * cg - d * sg;
    const yp = p.y * cn + (p.x * sg + d * cg) * sn;
    const s = worldToScreen(orbit(yaw, pitch, { zoom: 2, x: 3, y: 4, width: 100, height: 60 }), p, d);
    expect(s.x).toBeCloseTo(xp * 2 + 50 + 3, 9);
    expect(s.y).toBeCloseTo(yp * 2 + 30 + 4, 9);
    // mirror negates x′, then roll 90 maps (x′, y′) → (−y′, x′)
    const m = worldToScreen(orbit(yaw, pitch, { mirror: true, rotation: 90 }), p, d);
    expect(m.x).toBeCloseTo(-yp, 9);
    expect(m.y).toBeCloseTo(-xp, 9);
  });

  for (const rotation of [0, 37, -135]) {
    for (const zoom of [0.5, 2]) {
      it(`front view keeps the old roll / zoom / pan mapping (roll ${rotation}, zoom ${zoom})`, () => {
        const view: ViewTransform = { ...base, zoom, rotation };
        const cos = Math.cos((rotation * Math.PI) / 180);
        const sin = Math.sin((rotation * Math.PI) / 180);
        for (const p of [{ x: 3, y: 4 }, { x: -120, y: 33.5 }]) {
          const s = worldToScreen(view, p);
          expect(s.x).toBeCloseTo((p.x * cos - p.y * sin) * zoom + 400 + 13, 9);
          expect(s.y).toBeCloseTo((p.x * sin + p.y * cos) * zoom + 300 - 7, 9);
          // depth is invisible in the front view
          const d = worldToScreen(view, p, 24);
          expect(d.x).toBeCloseTo(s.x, 9);
          expect(d.y).toBeCloseTo(s.y, 9);
        }
      });
    }
  }

  it('viewMatrix maps depth 0; depthOffset is the screen shift of a layer (without pan)', () => {
    const view: ViewTransform = { ...base, zoom: 2, rotation: 37, yaw: 30, pitch: -20, mirror: true };
    const m = viewMatrix(view);
    const p = { x: 9, y: -4 };
    const s = worldToScreen(view, p);
    expect(m[0] * p.x + m[2] * p.y + m[4]).toBeCloseTo(s.x, 9);
    expect(m[1] * p.x + m[3] * p.y + m[5]).toBeCloseTo(s.y, 9);
    const o = depthOffset(view, 10);
    const sd = worldToScreen(view, p, 10);
    expect(sd.x - s.x).toBeCloseTo(o.x, 9);
    expect(sd.y - s.y).toBeCloseTo(o.y, 9);
    expect(depthOffset({ ...view, x: 500, y: -500 }, 10)).toEqual(o);
    const z = depthOffset(view, 0);
    expect(z.x).toBeCloseTo(0, 12);
    expect(z.y).toBeCloseTo(0, 12);
  });

  it('mirror negates screen x at roll 0', () => {
    const view = orbit(0, 0, { mirror: true, zoom: 2 });
    const s = worldToScreen(view, { x: 1, y: 3 });
    expect(s.x).toBeCloseTo(-2, 9);
    expect(s.y).toBeCloseTo(6, 9);
  });

  it('axisScale clamps |cos| to MIN_AXIS_SCALE with sign (sign(0) = +1)', () => {
    expect(MIN_AXIS_SCALE).toBe(0.05);
    expect(axisScale(1)).toBe(1);
    expect(axisScale(-0.5)).toBe(-0.5);
    expect(axisScale(0)).toBe(MIN_AXIS_SCALE);
    expect(axisScale(0.01)).toBe(MIN_AXIS_SCALE);
    expect(axisScale(-0.01)).toBe(-MIN_AXIS_SCALE);
  });

  it('isBackView: the camera looks at the back of the rig plane', () => {
    expect(isBackView(orbit(180, 0))).toBe(true);
    expect(isBackView(orbit(91, 0))).toBe(true);
    expect(isBackView(orbit(0, 0))).toBe(false);
    expect(isBackView(orbit(90, 0))).toBe(false);
    expect(isBackView(orbit(0, 0, { mirror: true }))).toBe(false);
  });
});

describe('pinchView', () => {
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  for (const [rotation, yaw, pitch] of [[0, 0, 0], [37, 0, 0], [37, 180, 0], [0, 90, 0], [-20, 135, 30], [10, -40, -90]]) {
    it(`keeps the world point under the old midpoint under the new midpoint (rotation ${rotation}, yaw ${yaw}, pitch ${pitch})`, () => {
      const view: ViewTransform = { ...base, zoom: 1.5, rotation, yaw, pitch };
      const prev: [Vec2, Vec2] = [{ x: 100, y: 200 }, { x: 180, y: 260 }];
      const next: [Vec2, Vec2] = [{ x: 60, y: 150 }, { x: 260, y: 330 }];
      const w = screenToWorld(view, mid(prev[0], prev[1]));
      const out = pinchView(view, prev, next);
      const s = worldToScreen(out, w);
      const m = mid(next[0], next[1]);
      expect(s.x).toBeCloseTo(m.x, 6);
      expect(s.y).toBeCloseTo(m.y, 6);
      expect(out.rotation).toBe(rotation);
    });
  }

  it('doubling the finger distance doubles the zoom', () => {
    const view: ViewTransform = { ...base, zoom: 2, rotation: 0 };
    const out = pinchView(view, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 50, y: 100 }, { x: 250, y: 100 }]);
    expect(out.zoom).toBeCloseTo(4, 9);
  });

  it('clamps the zoom to 16 and 0.25', () => {
    const view: ViewTransform = { ...base, zoom: 10, rotation: 0 };
    expect(pinchView(view, [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 100, y: 0 }]).zoom).toBe(16);
    expect(pinchView({ ...view, zoom: 0.5 }, [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 1, y: 0 }]).zoom).toBe(0.25);
  });

  it('distance 0 leaves the zoom unchanged', () => {
    const view: ViewTransform = { ...base, zoom: 3, rotation: 37 };
    expect(pinchView(view, [{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 100, y: 0 }]).zoom).toBe(3);
    expect(pinchView(view, [{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 5, y: 5 }, { x: 5, y: 5 }]).zoom).toBe(3);
  });

  it('moving both fingers by the same amount only pans', () => {
    const view: ViewTransform = { ...base, zoom: 2, rotation: 37 };
    const out = pinchView(view, [{ x: 100, y: 100 }, { x: 200, y: 150 }], [{ x: 130, y: 80 }, { x: 230, y: 130 }]);
    expect(out.zoom).toBe(2);
    expect(out.x).toBeCloseTo(view.x + 30, 9);
    expect(out.y).toBeCloseTo(view.y - 20, 9);
  });
});

describe('rotatePanAroundCenter', () => {
  for (const [rotation, delta] of [[0, 15], [37, 90], [-135, -60], [180, 270]]) {
    it(`keeps the world point under the centre fixed (rotation ${rotation}, delta ${delta})`, () => {
      const view: ViewTransform = { ...base, zoom: 2.5, rotation };
      const center = { x: view.width / 2, y: view.height / 2 };
      const before = screenToWorld(view, center);
      const turned = rotatePanAroundCenter(view, delta);
      const after = screenToWorld({ ...turned, rotation: rotation + delta }, center);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
      expect(turned.zoom).toBe(2.5);
      expect(turned.rotation).toBe(rotation);
    });
  }

  it('a zero delta keeps the pan', () => {
    expect(rotatePanAroundCenter({ x: 3, y: -4, zoom: 1 }, 0)).toEqual({ x: 3, y: -4, zoom: 1 });
  });
});

describe('followCameraPan', () => {
  const A = (rotation: number, yaw: number, pitch = 0, mirror = false): CameraAngles => ({ rotation, yaw, pitch, mirror });
  const cases: [CameraAngles, CameraAngles][] = [
    [A(0, 0), A(0, 180)],
    [A(37, 0), A(37, 180)],
    [A(37, 30), A(37, 135)],
    [A(-60, 180), A(-60, 0)],
    [A(20, 0), A(20, 90)],
    [A(20, 90), A(20, -60)],
    [A(0, 0), A(45, 0)],
    [A(10, 135), A(-80, 30)],
    [A(0, 0, 0, false), A(90, 60, 30, true)],
    [A(0, 0, 0, false), A(0, 0, 0, true)],
    [A(15, -30, 90, true), A(0, 0, -45, false)],
  ];
  for (const [from, to] of cases) {
    it(`keeps the world point under the centre fixed (${JSON.stringify(from)} → ${JSON.stringify(to)})`, () => {
      const view: ViewTransform = { ...base, zoom: 2.5, ...from };
      const center = { x: view.width / 2, y: view.height / 2 };
      const before = screenToWorld(view, center);
      const moved = followCameraPan(view, from, to);
      const after = screenToWorld({ ...moved, ...to }, center);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
      expect(moved.zoom).toBe(2.5);
    });
  }

  it('matches rotatePanAroundCenter for a pure roll change', () => {
    const view = { x: 30, y: -12, zoom: 1 };
    const a = followCameraPan(view, A(10, 40, 20), A(55, 40, 20));
    const b = rotatePanAroundCenter(view, 45);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  });

  it('mirroring at roll 0 negates the horizontal pan', () => {
    const out = followCameraPan({ x: 30, y: -12, zoom: 1 }, A(0, 0), A(0, 0, 0, true));
    expect(out.x).toBeCloseTo(-30, 9);
    expect(out.y).toBeCloseTo(-12, 9);
  });
});
