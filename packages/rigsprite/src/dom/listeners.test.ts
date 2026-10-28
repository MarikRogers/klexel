// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { addListeners } from './listeners';

it('addListeners adds every entry and the returned function removes exactly those', () => {
  const div = document.createElement('div');
  const onDown = vi.fn();
  const onKey = vi.fn();
  const remove = addListeners([
    [div, 'pointerdown', onDown],
    [window, 'keydown', onKey, { passive: true }],
  ]);
  div.dispatchEvent(new Event('pointerdown'));
  window.dispatchEvent(new Event('keydown'));
  remove();
  div.dispatchEvent(new Event('pointerdown'));
  window.dispatchEvent(new Event('keydown'));
  expect(onDown).toHaveBeenCalledTimes(1);
  expect(onKey).toHaveBeenCalledTimes(1);
});
