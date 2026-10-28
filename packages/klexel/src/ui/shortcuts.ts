export type Shortcut = 'undo' | 'redo';

interface KeyLike { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
interface TargetLike { tagName: string; type?: string; isContentEditable?: boolean }

/** Strg/Cmd+Z = Rückgängig; Strg/Cmd+Umschalt+Z oder Strg+Y = Wiederholen. Alles andere: null. */
export function shortcutFor(e: KeyLike): Shortcut | null {
  if (e.altKey || (!e.ctrlKey && !e.metaKey)) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey) return 'redo';
  return null;
}

export type SelectionShortcut = 'copy' | 'cut' | 'paste' | 'all' | 'none' | 'delete';

/** Strg/Cmd+C/X/V/A, Entf/Rückschritt = Löschen, Esc = Auswahl aufheben. Alles andere: null. */
export function selectionShortcutFor(e: KeyLike): SelectionShortcut | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) {
    if (e.shiftKey) return null;
    if (e.key === 'Delete' || e.key === 'Backspace') return 'delete';
    if (e.key === 'Escape') return 'none';
    return null;
  }
  if (e.shiftKey) return null;
  switch (e.key.toLowerCase()) {
    case 'c': return 'copy';
    case 'x': return 'cut';
    case 'v': return 'paste';
    case 'a': return 'all';
    default: return null;
  }
}

/** Tooltip-Kürzel je Aktion der Auswahl-Leiste. */
export const SELECTION_SHORTCUT_LABEL: Record<SelectionShortcut, string> = {
  copy: 'Strg+C', cut: 'Strg+X', paste: 'Strg+V', all: 'Strg+A', none: 'Esc', delete: 'Entf',
};

const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'color', 'file', 'submit', 'reset']);

/** Tippt der Nutzer gerade Text? Dann gehören die Tasten dem Eingabefeld (eigenes Rückgängig des Browsers). */
export function isTypingTarget(t: TargetLike | null): boolean {
  if (!t) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t.tagName === 'INPUT' && !NON_TEXT_INPUTS.has((t.type ?? 'text').toLowerCase());
}
