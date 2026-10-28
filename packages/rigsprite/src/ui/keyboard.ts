const TEXT_INPUT_TYPES = ['text', 'number', 'search', 'email', 'url', 'tel', 'password'];

/** True if typing happens in this element (text-like input, textarea, select, contentEditable). */
export function isTextEntryTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.isContentEditable ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLInputElement && TEXT_INPUT_TYPES.includes(t.type))
  );
}

/** True if Space has its own meaning here: text entry, buttons, checkboxes, any input. */
export function isSpaceSensitiveTarget(t: EventTarget | null): boolean {
  return isTextEntryTarget(t) || (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName));
}
