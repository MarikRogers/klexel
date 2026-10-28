// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditor } from '../state/store';
import { renderWithShortcuts } from '../test/renderWithShortcuts';
import { dispatchShortcut, pushEscape, SHORTCUTS, useEscape, useGlobalShortcuts, useShortcut, type Shortcut } from './shortcuts';

const el = (tag: string, type?: string) => {
  const e = document.createElement(tag);
  if (type) (e as HTMLInputElement).type = type;
  document.body.appendChild(e);
  return e;
};

/** Dispatches a KeyboardEvent at `target` (default: body) through `table`; returns [handled, defaultPrevented]. */
function press(table: readonly Shortcut[], init: KeyboardEventInit & { type?: string }, target: Element = document.body) {
  const { type = 'keydown', ...rest } = init;
  const e = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...rest });
  let handled = false;
  target.addEventListener(type, (ev) => (handled = dispatchShortcut(table, ev as KeyboardEvent)), { once: true });
  target.dispatchEvent(e);
  return [handled, e.defaultPrevented];
}

beforeEach(() => {
  useEditor.getState().newProject('humanoid');
  useEditor.setState({ spaceHeld: false, spacePanned: false });
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('dispatchShortcut', () => {
  const run = vi.fn();
  beforeEach(() => run.mockReset());

  it('matches code, key (case-insensitive), modifiers, shift, repeat and event type', () => {
    const table: Shortcut[] = [{ key: 'z', mods: 'ctrl', shift: false, guard: 'none', run }];
    expect(press(table, { key: 'z' })).toEqual([false, false]);
    expect(press(table, { key: 'Z', ctrlKey: true, shiftKey: true })).toEqual([false, false]);
    expect(press(table, { key: 'Z', metaKey: true })).toEqual([true, true]);
    expect(press(table, { key: 'z', ctrlKey: true, altKey: true })).toEqual([true, true]);
    const q: Shortcut[] = [{ code: 'KeyQ', mods: 'none', noRepeat: true, guard: 'none', run }];
    expect(press(q, { code: 'KeyQ', altKey: true })[0]).toBe(false);
    expect(press(q, { code: 'KeyQ', repeat: true })[0]).toBe(false);
    expect(press(q, { code: 'KeyQ', type: 'keyup' })[0]).toBe(false);
    expect(press(q, { code: 'KeyQ', shiftKey: true })[0]).toBe(true);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('respects the text-entry and space-sensitive guards', () => {
    const text: Shortcut[] = [{ code: 'KeyE', guard: 'textEntry', run }];
    expect(press(text, { code: 'KeyE' }, el('input', 'text'))[0]).toBe(false);
    expect(press(text, { code: 'KeyE' }, el('textarea'))[0]).toBe(false);
    expect(press(text, { code: 'KeyE' }, el('select'))[0]).toBe(false);
    expect(press(text, { code: 'KeyE' }, el('input', 'checkbox'))[0]).toBe(true);
    expect(press(text, { code: 'KeyE' }, el('button'))[0]).toBe(true);
    const space: Shortcut[] = [{ code: 'Space', guard: 'spaceSensitive', run }];
    expect(press(space, { code: 'Space' }, el('input', 'checkbox'))[0]).toBe(false);
    expect(press(space, { code: 'Space' }, el('button'))[0]).toBe(false);
    expect(press(space, { code: 'Space' }, el('div'))[0]).toBe(true);
  });

  it('skips entries whose condition is false and honours preventDefault: false', () => {
    const second = vi.fn();
    const table: Shortcut[] = [
      { key: 'x', guard: 'none', when: () => false, run },
      { key: 'x', guard: 'none', preventDefault: false, run: second },
    ];
    expect(press(table, { key: 'x' })).toEqual([true, false]);
    expect(run).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('SHORTCUTS', () => {
  const s = () => useEditor.getState();
  const rot = () => s().project.settings.cameraRotation;

  it('Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z undo and redo, not in text fields', () => {
    s().setProjectName('B');
    expect(press(SHORTCUTS, { key: 'z', ctrlKey: true }, el('input', 'text'))[0]).toBe(false);
    expect(s().project.name).toBe('B');
    press(SHORTCUTS, { key: 'z', ctrlKey: true });
    expect(s().project.name).not.toBe('B');
    press(SHORTCUTS, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(s().project.name).toBe('B');
    press(SHORTCUTS, { key: 'z', ctrlKey: true });
    press(SHORTCUTS, { key: 'y', ctrlKey: true });
    expect(s().project.name).toBe('B');
  });

  it('Q / E turn the camera unless typing, modified, repeated or dragging', () => {
    press(SHORTCUTS, { code: 'KeyE' });
    expect(rot()).toBe(15);
    press(SHORTCUTS, { code: 'KeyQ', ctrlKey: true });
    press(SHORTCUTS, { code: 'KeyQ', repeat: true });
    press(SHORTCUTS, { code: 'KeyQ' }, el('input', 'number'));
    expect(rot()).toBe(15);
    s().beginTransaction();
    expect(press(SHORTCUTS, { code: 'KeyQ' })).toEqual([false, false]);
    s().cancelTransaction();
    press(SHORTCUTS, { code: 'KeyQ' });
    expect(rot()).toBe(0);
  });

  it('A / D turn the orbit yaw by ∓15°, M mirrors, H toggles the rig; not while typing, modified, repeated or dragging', () => {
    const yaw = () => s().orbit.yaw;
    s().setOrbit(0, 0);
    expect(press(SHORTCUTS, { code: 'KeyD' })).toEqual([true, true]);
    expect(yaw()).toBe(15);
    press(SHORTCUTS, { code: 'KeyA' });
    press(SHORTCUTS, { code: 'KeyA' });
    expect(yaw()).toBe(-15);
    press(SHORTCUTS, { code: 'KeyM' });
    expect(s().project.settings.mirror).toBe(true);
    expect(yaw()).toBe(-15);
    press(SHORTCUTS, { code: 'KeyM' });
    expect(s().project.settings.mirror).toBe(false);
    const rigBefore = s().showRig;
    press(SHORTCUTS, { code: 'KeyH' });
    expect(s().showRig).toBe(!rigBefore);
    press(SHORTCUTS, { code: 'KeyH' });
    expect(s().showRig).toBe(rigBefore);
    expect(rot()).toBe(0);
    for (const code of ['KeyA', 'KeyD', 'KeyM']) {
      expect(press(SHORTCUTS, { code, ctrlKey: true })[0]).toBe(false);
      expect(press(SHORTCUTS, { code, altKey: true })[0]).toBe(false);
      expect(press(SHORTCUTS, { code, metaKey: true })[0]).toBe(false);
      expect(press(SHORTCUTS, { code, repeat: true })[0]).toBe(false);
      expect(press(SHORTCUTS, { code }, el('input', 'number'))[0]).toBe(false);
      expect(press(SHORTCUTS, { code }, el('input', 'text'))[0]).toBe(false);
    }
    expect(yaw()).toBe(-15);
    s().beginTransaction();
    for (const code of ['KeyA', 'KeyD', 'KeyM']) expect(press(SHORTCUTS, { code })).toEqual([false, false]);
    s().cancelTransaction();
    expect(yaw()).toBe(-15);
  });

  it('W / S turn the orbit pitch by ±15°; 1 / 3 / 7 (row or numpad) jump to Vorne / Seite / Oben', () => {
    const orbit = () => s().orbit;
    s().setOrbit(0, 0);
    expect(press(SHORTCUTS, { code: 'KeyW' })).toEqual([true, true]);
    expect(orbit().pitch).toBe(15);
    press(SHORTCUTS, { code: 'KeyS' });
    press(SHORTCUTS, { code: 'KeyS' });
    expect(orbit().pitch).toBe(-15);
    press(SHORTCUTS, { code: 'Numpad7' });
    expect(orbit()).toEqual({ yaw: 0, pitch: 90 });
    press(SHORTCUTS, { code: 'Digit3' });
    expect(orbit()).toEqual({ yaw: 90, pitch: 0 });
    press(SHORTCUTS, { code: 'Digit1' });
    expect(orbit()).toEqual({ yaw: 0, pitch: 0 });
    press(SHORTCUTS, { code: 'Numpad3' });
    expect(orbit()).toEqual({ yaw: 90, pitch: 0 });
    press(SHORTCUTS, { code: 'Numpad1' });
    press(SHORTCUTS, { code: 'Digit7' });
    expect(orbit()).toEqual({ yaw: 0, pitch: 90 });
    press(SHORTCUTS, { code: 'Digit1' });
    for (const code of ['KeyW', 'KeyS', 'Digit1', 'Digit3', 'Digit7', 'Numpad1', 'Numpad3', 'Numpad7']) {
      expect(press(SHORTCUTS, { code, ctrlKey: true })[0]).toBe(false);
      expect(press(SHORTCUTS, { code, repeat: true })[0]).toBe(false);
      expect(press(SHORTCUTS, { code }, el('input', 'text'))[0]).toBe(false);
    }
    expect(press(SHORTCUTS, { code: 'KeyA' }, el('input', 'text'))[0]).toBe(false);
    expect(orbit()).toEqual({ yaw: 0, pitch: 0 });
    s().beginTransaction();
    for (const code of ['KeyW', 'Digit3']) expect(press(SHORTCUTS, { code })).toEqual([false, false]);
    s().cancelTransaction();
    expect(orbit()).toEqual({ yaw: 0, pitch: 0 });
  });

  it('Space: held while pressed, toggles playback on release unless a pan happened', () => {
    s().setMode('animate');
    s().addAnimation('a');
    expect(press(SHORTCUTS, { code: 'Space' })).toEqual([true, true]);
    expect(s().spaceHeld).toBe(true);
    press(SHORTCUTS, { code: 'Space', type: 'keyup' });
    expect(s().spaceHeld).toBe(false);
    expect(s().playing).toBe(true);

    press(SHORTCUTS, { code: 'Space' });
    s().setSpacePanned(true);
    press(SHORTCUTS, { code: 'Space', repeat: true });
    expect(s().spacePanned).toBe(true);
    press(SHORTCUTS, { code: 'Space', type: 'keyup' });
    expect(s().playing).toBe(true);
    expect(s().spacePanned).toBe(false);
  });

  it('Space on a button or checkbox is left alone, but its release still ends pan mode', () => {
    s().setMode('animate');
    s().addAnimation('a');
    s().setSpaceHeld(true);
    const box = el('input', 'checkbox');
    expect(press(SHORTCUTS, { code: 'Space' }, box)[0]).toBe(false);
    press(SHORTCUTS, { code: 'Space', type: 'keyup' }, box);
    expect(s().spaceHeld).toBe(false);
    expect(s().playing).toBe(false);
  });

  it('Escape closes the topmost entry of the Escape stack only', () => {
    const a = vi.fn();
    const b = vi.fn();
    const popA = pushEscape(a);
    const popB = pushEscape(b);
    expect(press(SHORTCUTS, { key: 'Escape' })).toEqual([true, false]);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    popB();
    press(SHORTCUTS, { key: 'Escape' });
    expect(a).toHaveBeenCalledTimes(1);
    popA();
    expect(press(SHORTCUTS, { key: 'Escape' })[0]).toBe(false);
  });
});

describe('shortcut hooks', () => {
  it('useGlobalShortcuts listens on window while mounted; blur releases Space', () => {
    const { unmount } = renderWithShortcuts(null);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    expect(useEditor.getState().project.settings.cameraRotation).toBe(15);
    useEditor.getState().setSpaceHeld(true);
    window.dispatchEvent(new Event('blur'));
    expect(useEditor.getState().spaceHeld).toBe(false);
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
    expect(useEditor.getState().project.settings.cameraRotation).toBe(15);
  });

  it('useShortcut registers a component shortcut with its latest closure while mounted', () => {
    const calls: number[] = [];
    function C({ n }: { n: number }) {
      useGlobalShortcuts();
      useShortcut({ key: 'Delete', guard: 'none', run: () => calls.push(n) });
      return null;
    }
    const { rerender, unmount } = render(<C n={1} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    rerender(<C n={2} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(calls).toEqual([1, 2]);
  });

  it('useEscape is on the Escape stack only while open', () => {
    const close = vi.fn();
    function C({ open }: { open: boolean }) {
      useEscape(open, close);
      return null;
    }
    const { rerender } = render(<C open={false} />);
    expect(press(SHORTCUTS, { key: 'Escape' })[0]).toBe(false);
    rerender(<C open />);
    act(() => void press(SHORTCUTS, { key: 'Escape' }));
    expect(close).toHaveBeenCalledTimes(1);
    rerender(<C open={false} />);
    expect(press(SHORTCUTS, { key: 'Escape' })[0]).toBe(false);
  });
});
