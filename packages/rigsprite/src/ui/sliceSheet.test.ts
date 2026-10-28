// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawSheetPreview } from './sliceSheet';

afterEach(() => vi.restoreAllMocks());

describe('drawSheetPreview', () => {
  it('sizes the canvas to the image, draws it and outlines every cell', () => {
    const calls: string[] = [];
    const ctx = {
      clearRect: (...a: number[]) => calls.push(`clear ${a.join(',')}`),
      drawImage: (_img: unknown, x: number, y: number) => calls.push(`image ${x},${y}`),
      strokeRect: (...a: number[]) => calls.push(`rect ${a.join(',')}`),
      strokeStyle: '',
      lineWidth: 0,
    };
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const img = { naturalWidth: 64, naturalHeight: 32 } as HTMLImageElement;
    drawSheetPreview(canvas, img, [
      { name: 'a', x: 0, y: 0, w: 32, h: 32 },
      { name: 'b', x: 32, y: 0, w: 32, h: 32 },
    ]);
    expect([canvas.width, canvas.height]).toEqual([64, 32]);
    expect(calls).toEqual(['clear 0,0,64,32', 'image 0,0', 'rect 0.5,0.5,31,31', 'rect 32.5,0.5,31,31']);
    expect(ctx.strokeStyle).toBe('#ff3b6b');
    expect(ctx.lineWidth).toBe(1);
  });

  it('does nothing without a 2D context', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    drawSheetPreview(canvas, { naturalWidth: 8, naturalHeight: 8 } as HTMLImageElement, []);
    expect(canvas.width).toBe(300);
  });
});
