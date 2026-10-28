import { describe, expect, it } from 'vitest';
import { clamp } from '../core/math';
import { MAX_ZOOM, MIN_ZOOM, screenToWorld, worldToScreen, type ViewTransform } from '../render/view';
import { createProject } from '../core/project';
import { WHEEL_ZOOM_SENSITIVITY } from './constants';
import { cssView, deviceView, zoomAt } from './viewportView';

const base: ViewTransform = { x: 12, y: -7, zoom: 2, rotation: 30, yaw: 0, pitch: 0, mirror: false, width: 640, height: 480 };

describe('zoomAt', () => {
  for (const [rotation, yaw, pitch] of [[0, 0, 0], [30, 0, 0], [-135, 0, 0], [30, 180, 0], [0, 90, 45], [-135, 120, -90]]) {
    it(`keeps the world point under the cursor fixed (rotation ${rotation}, yaw ${yaw}, pitch ${pitch})`, () => {
      const view = { ...base, rotation, yaw, pitch, mirror: yaw === 180 };
      const p = { x: 100, y: 333 };
      const w = screenToWorld(view, p);
      const out = zoomAt(view, p, -240);
      const s = worldToScreen({ ...view, ...out }, w);
      expect(s.x).toBeCloseTo(p.x, 6);
      expect(s.y).toBeCloseTo(p.y, 6);
    });
  }

  it('zooms by exp(-deltaY · sensitivity), clamped', () => {
    expect(zoomAt(base, { x: 0, y: 0 }, 100).zoom).toBeCloseTo(clamp(2 * Math.exp(-100 * WHEEL_ZOOM_SENSITIVITY), MIN_ZOOM, MAX_ZOOM), 12);
    expect(zoomAt(base, { x: 0, y: 0 }, -1e6).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(base, { x: 0, y: 0 }, 1e6).zoom).toBe(MIN_ZOOM);
  });

  it('zero delta keeps the view', () => {
    const out = zoomAt(base, { x: 50, y: 60 }, 0);
    expect(out.zoom).toBe(2);
    expect(out.x).toBeCloseTo(base.x, 9);
    expect(out.y).toBeCloseTo(base.y, 9);
  });
});

describe('cssView / deviceView', () => {
  it('takes pan / zoom from the editor, roll / mirror from the project and yaw / pitch from the orbit', () => {
    const project = createProject('humanoid');
    project.settings.cameraRotation = 45;
    project.settings.mirror = true;
    const orbit = { yaw: 30, pitch: -20 };
    const v = cssView({ view: { x: 1, y: 2, zoom: 3 }, project, orbit }, { width: 300, height: 200, dpr: 2 });
    expect(v).toEqual({ x: 1, y: 2, zoom: 3, rotation: 45, yaw: 30, pitch: -20, mirror: true, width: 300, height: 200 });
    expect(deviceView(v, 2, 600, 400)).toEqual({
      x: 2,
      y: 4,
      zoom: 6,
      rotation: 45,
      yaw: 30,
      pitch: -20,
      mirror: true,
      width: 600,
      height: 400,
    });
  });
});
