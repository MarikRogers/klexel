// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isSpaceSensitiveTarget, isTextEntryTarget } from './keyboard';

const input = (type: string) => {
  const el = document.createElement('input');
  el.type = type;
  return el;
};

describe('keyboard target guards', () => {
  it('treats text-like inputs, textarea and select as text entry', () => {
    for (const type of ['text', 'number', 'search', 'email', 'url', 'tel', 'password']) {
      expect(isTextEntryTarget(input(type))).toBe(true);
    }
    expect(isTextEntryTarget(document.createElement('textarea'))).toBe(true);
    expect(isTextEntryTarget(document.createElement('select'))).toBe(true);
  });

  it('does not treat checkboxes, buttons, divs or non-elements as text entry', () => {
    expect(isTextEntryTarget(input('checkbox'))).toBe(false);
    expect(isTextEntryTarget(document.createElement('button'))).toBe(false);
    expect(isTextEntryTarget(document.createElement('div'))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(window)).toBe(false);
  });

  it('treats contentEditable elements as text entry', () => {
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isTextEntryTarget(div)).toBe(true);
    expect(isSpaceSensitiveTarget(div)).toBe(true);
  });

  it('space-sensitive additionally covers buttons and every input type', () => {
    expect(isSpaceSensitiveTarget(document.createElement('button'))).toBe(true);
    expect(isSpaceSensitiveTarget(input('checkbox'))).toBe(true);
    expect(isSpaceSensitiveTarget(input('text'))).toBe(true);
    expect(isSpaceSensitiveTarget(document.createElement('div'))).toBe(false);
    expect(isSpaceSensitiveTarget(null)).toBe(false);
  });
});
