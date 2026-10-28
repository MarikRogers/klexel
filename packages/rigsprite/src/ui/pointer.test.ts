// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { capturePointer } from './pointer';

describe('capturePointer', () => {
  it('captures the pointer on the element', () => {
    const el = document.createElement('div');
    el.setPointerCapture = vi.fn();
    capturePointer(el, 7);
    expect(el.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('swallows errors for pointers that are gone', () => {
    const el = document.createElement('div');
    el.setPointerCapture = vi.fn(() => {
      throw new DOMException('gone', 'NotFoundError');
    });
    expect(() => capturePointer(el, 1)).not.toThrow();
  });
});
