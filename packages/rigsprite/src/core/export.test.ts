import { describe, expect, it } from 'vitest';
import type { FrameData } from './frame';
import { buildSheetMetadata, checkSheetSize, computeExportBounds, layoutSheet, planSheet, rotatePoints, sanitizeFileName, uniqueNames } from './export';

function frameWith(points: [number, number][]): FrameData {
  const positions = new Float32Array(points.flatMap(([x, y]) => [x, y]));
  return {
    world: {},
    items: [{ partId: 'p', imageId: 'i', positions, uvs: new Float32Array(positions.length), indices: new Uint16Array(0), z: 0 }],
  };
}

describe('layoutSheet', () => {
  it('starts each animation on a new row and wraps at maxColumns', () => {
    const l = layoutSheet([3, 5], 10, 20, 4);
    expect(l.width).toBe(40);
    expect(l.height).toBe(60);
    expect(l.cells.find((c) => c.animationIndex === 1 && c.frameIndex === 4)).toMatchObject({ x: 0, y: 40 });
    expect(l.cells).toHaveLength(8);
  });
});

describe('computeExportBounds', () => {
  it('rounds outwards and adds padding', () => {
    const b = computeExportBounds([frameWith([[-3.2, 0], [7.1, 5]])], 2);
    expect(b.x).toBe(-6);
    expect(b.w).toBe(16);
    expect(b.y).toBe(-2);
  });
  it('unions several frames', () => {
    const b = computeExportBounds([frameWith([[0, 0]]), frameWith([[10, 10]])], 0);
    expect(b).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
  it('computes bounds in rotated space', () => {
    const rect = frameWith([[0, 0], [40, 0], [40, 10], [0, 10]]);
    const b = computeExportBounds([rect], 2, 90);
    expect(b.w).toBe(10 + 4);
    expect(b.h).toBe(40 + 4);
    // (x, y) → (-y, x) for 90° clockwise in y-down
    expect(b).toEqual({ x: -12, y: -2, w: 14, h: 44 });
  });
  it('applies the x scale (-1 = mirror) before the roll', () => {
    const rect = frameWith([[0, 0], [40, 0], [40, 10], [0, 10]]);
    expect(computeExportBounds([rect], 0, 0, -1)).toEqual({ x: -40, y: 0, w: 40, h: 10 });
    expect(computeExportBounds([rect], 2, 0, -1)).toEqual({ x: -42, y: -2, w: 44, h: 14 });
    // mirror (-x, y), then 90° clockwise (x, y) → (-y, x)
    expect(computeExportBounds([rect], 0, 90, -1)).toEqual({ x: -10, y: -40, w: 10, h: 40 });
    // a scale of 0.5 halves the width
    expect(computeExportBounds([rect], 0, 0, 0.5)).toEqual({ x: 0, y: 0, w: 20, h: 10 });
  });
  it('rotating inline gives the same bounds as rotating a Float32 copy with rotatePoints', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 200 - 100;
    const frames = Array.from({ length: 4 }, () => frameWith(Array.from({ length: 50 }, () => [rnd(), rnd()] as [number, number])));
    for (const rotation of [0, 13, 45, 90, -33.3, 180, 271.7]) {
      const rotated = frames.map((f) => ({ ...f, items: f.items.map((i) => ({ ...i, positions: rotatePoints(i.positions, rotation) })) }));
      for (const padding of [0, 3]) {
        expect(computeExportBounds(frames, padding, rotation)).toEqual(computeExportBounds(rotated, padding, 0));
      }
    }
  });
});

describe('rotatePoints', () => {
  it('rotates clockwise around the origin and returns a new array', () => {
    const src = new Float32Array([1, 0, 0, 1]);
    const r = rotatePoints(src, 90);
    expect(r).not.toBe(src);
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(1);
    expect(r[2]).toBeCloseTo(-1);
    expect(r[3]).toBeCloseTo(0);
    expect(Array.from(src)).toEqual([1, 0, 0, 1]);
  });
});

describe('buildSheetMetadata', () => {
  const animations = [
    { name: 'idle', fps: 12, frameCount: 3 },
    { name: 'walk', fps: 12, frameCount: 5 },
  ];
  const layout = layoutSheet([3, 5], 10, 20, 4);
  const meta = buildSheetMetadata({ animations, layout, frameW: 10, frameH: 20, imageName: 'x.png', scale: 2, pivot: { x: 4, y: 6 } }) as any;
  it('has all frames and tags', () => {
    expect(Object.keys(meta.frames)).toHaveLength(8);
    expect(meta.meta.frameTags[1]).toEqual({ name: 'walk', from: 3, to: 7, direction: 'forward' });
    expect(meta.frames['walk 4']).toMatchObject({ frame: { x: 0, y: 40, w: 10, h: 20 }, duration: 83, rotated: false });
    expect(meta.meta).toMatchObject({ app: 'rigsprite', image: 'x.png', scale: '2', size: { w: 40, h: 60 }, pivot: { x: 4, y: 6 } });
  });
});

describe('planSheet', () => {
  const bounds = { x: -5, y: -7, w: 10, h: 20 };
  it('expresses layout, frame size and pivot in PNG pixels at scale 2', () => {
    const plan = planSheet([3, 5], bounds, 2, 4);
    expect(plan.frameW).toBe(20);
    expect(plan.frameH).toBe(40);
    expect(plan.pivot).toEqual({ x: 10, y: 14 });
    expect(plan.layout.width).toBe(80);
    expect(plan.layout.height).toBe(120);
  });
  it('produces metadata whose meta.size equals the sheet size and whose frames tile the PNG at scale 2', () => {
    const plan = planSheet([3, 5], bounds, 2, 4);
    const meta = buildSheetMetadata({
      animations: [
        { name: 'idle', fps: 12, frameCount: 3 },
        { name: 'walk', fps: 12, frameCount: 5 },
      ],
      layout: plan.layout,
      frameW: plan.frameW,
      frameH: plan.frameH,
      imageName: 'x.png',
      scale: 2,
      pivot: plan.pivot,
    }) as any;
    expect(meta.meta.size).toEqual({ w: plan.layout.width, h: plan.layout.height });
    expect(meta.meta.size).toEqual({ w: 80, h: 120 });
    expect(meta.meta.pivot).toEqual({ x: 10, y: 14 });
    const rects = Object.values(meta.frames).map((f: any) => f.frame);
    for (const r of rects) {
      expect(r.w).toBe(20);
      expect(r.h).toBe(40);
      expect(r.x % 20).toBe(0);
      expect(r.y % 40).toBe(0);
      expect(r.x + r.w).toBeLessThanOrEqual(80);
      expect(r.y + r.h).toBeLessThanOrEqual(120);
    }
    expect(new Set(rects.map((r: any) => `${r.x},${r.y}`)).size).toBe(8);
    expect(meta.frames['walk 4'].frame).toEqual({ x: 0, y: 80, w: 20, h: 40 });
    expect(meta.frames['walk 4'].sourceSize).toEqual({ w: 20, h: 40 });
    expect(meta.frames['walk 4'].spriteSourceSize).toEqual({ x: 0, y: 0, w: 20, h: 40 });
  });
  it('equals the unscaled layout at scale 1', () => {
    const plan = planSheet([3, 5], bounds, 1, 4);
    expect(plan.layout).toEqual(layoutSheet([3, 5], 10, 20, 4));
    expect(plan.pivot).toEqual({ x: 5, y: 7 });
  });
});

describe('checkSheetSize', () => {
  it('flags oversize width with a width-specific hint', () => {
    const msg = checkSheetSize(9000, 300);
    expect(msg).toContain('9000×300');
    expect(msg).toContain('Skalierung verringern oder Spalten verringern');
  });
  it('flags oversize height with a height-specific hint', () => {
    const msg = checkSheetSize(300, 9000);
    expect(msg).toContain('300×9000');
    expect(msg).toContain('Skalierung verringern oder Spalten erhöhen');
  });
  it('accepts max', () => expect(checkSheetSize(8192, 8192)).toBeNull());
});

describe('unique names / filenames', () => {
  it('makes duplicate animation names unique and clamps fps', () => {
    const anims = [{ name: 'a', fps: 0, frameCount: 1 }, { name: 'a', fps: 10, frameCount: 1 }];
    const meta = buildSheetMetadata({ animations: anims, layout: layoutSheet([1, 1], 4, 4, 8), frameW: 4, frameH: 4, imageName: 'x.png', scale: 1, pivot: { x: 0, y: 0 } }) as any;
    expect(Object.keys(meta.frames)).toEqual(['a 0', 'a (2) 0']);
    expect(meta.frames['a 0'].duration).toBe(1000);
    expect(meta.meta.frameTags.map((t: any) => t.name)).toEqual(['a', 'a (2)']);
    expect(uniqueNames(['a', 'a', 'a (2)'])).toEqual(['a', 'a (3)', 'a (2)']);
  });
  it('sanitizes file names', () => {
    expect(sanitizeFileName('a/b:c*?"<>|\d')).toBe('a_b_c______d');
    expect(sanitizeFileName('  ')).toBe('spritesheet');
  });
});
