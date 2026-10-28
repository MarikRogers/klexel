// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../render/SkinRenderer', () => ({
  SkinRenderer: class {
    constructor() {
      throw new Error('kein WebGL2');
    }
  },
}));

import { Viewport } from './Viewport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Viewport', () => {
  it('shows a German message instead of crashing when WebGL2 is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<Viewport />);
    expect(screen.getByRole('alert').textContent).toBe('WebGL2 wird von diesem Browser nicht unterstützt.');
  });
});
