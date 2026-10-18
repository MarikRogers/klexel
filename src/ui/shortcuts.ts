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

const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'color', 'file', 'submit', 'reset']);

/** Tippt der Nutzer gerade Text? Dann gehören die Tasten dem Eingabefeld (eigenes Rückgängig des Browsers). */
export function isTypingTarget(t: TargetLike | null): boolean {
  if (!t) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  return t.tagName === 'INPUT' && !NON_TEXT_INPUTS.has((t.type ?? 'text').toLowerCase());
}
