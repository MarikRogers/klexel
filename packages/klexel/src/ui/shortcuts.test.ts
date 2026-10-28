import { describe, it, expect } from 'vitest';
import { shortcutFor, selectionShortcutFor, isTypingTarget } from './shortcuts';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('shortcutFor', () => {
  it('Ctrl+Z and Cmd+Z undo', () => {
    expect(shortcutFor(key('z', { ctrlKey: true }))).toBe('undo');
    expect(shortcutFor(key('Z', { ctrlKey: true }))).toBe('undo');
    expect(shortcutFor(key('z', { metaKey: true }))).toBe('undo');
  });

  it('Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y redo', () => {
    expect(shortcutFor(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcutFor(key('z', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcutFor(key('y', { ctrlKey: true }))).toBe('redo');
    expect(shortcutFor(key('Y', { ctrlKey: true }))).toBe('redo');
  });

  it('ignores plain keys and other modifier combinations', () => {
    expect(shortcutFor(key('z'))).toBeNull();
    expect(shortcutFor(key('y'))).toBeNull();
    expect(shortcutFor(key('z', { shiftKey: true }))).toBeNull();
    expect(shortcutFor(key('z', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutFor(key('y', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(shortcutFor(key('x', { ctrlKey: true }))).toBeNull();
  });
});

describe('selectionShortcutFor', () => {
  it('maps the clipboard and select-all shortcuts', () => {
    expect(selectionShortcutFor(key('c', { ctrlKey: true }))).toBe('copy');
    expect(selectionShortcutFor(key('X', { ctrlKey: true }))).toBe('cut');
    expect(selectionShortcutFor(key('v', { metaKey: true }))).toBe('paste');
    expect(selectionShortcutFor(key('a', { ctrlKey: true }))).toBe('all');
  });

  it('maps Delete, Backspace and Escape', () => {
    expect(selectionShortcutFor(key('Delete'))).toBe('delete');
    expect(selectionShortcutFor(key('Backspace'))).toBe('delete');
    expect(selectionShortcutFor(key('Escape'))).toBe('none');
  });

  it('ignores plain letters and other combinations', () => {
    expect(selectionShortcutFor(key('c'))).toBeNull();
    expect(selectionShortcutFor(key('c', { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(selectionShortcutFor(key('c', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(selectionShortcutFor(key('Delete', { shiftKey: true }))).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('is true for text inputs, textareas, selects and editable content', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for buttons, the page body, sliders and checkboxes', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
