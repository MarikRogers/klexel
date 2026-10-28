import type { Frame } from '../model/Document';

/** Beschriftung einer Frame-Kachel: der Name, sonst die laufende Nummer (ab 1). */
export function frameLabel(frame: Frame, index: number): string {
  return frame.name ? frame.name : String(index + 1);
}

/** Titel/Bedienhilfe-Name einer Frame-Kachel: „Frame 2: Lauf", ohne Namen „Frame 2". */
export function frameTitle(frame: Frame, index: number): string {
  return frame.name ? `Frame ${index + 1}: ${frame.name}` : `Frame ${index + 1}`;
}

export const RENAME_PROMPT = 'Name des Frames (leer = Nummer)';

/**
 * Benennt einen Frame über eine Rückfrage um (DOM-frei; die Rückfrage kommt von außen, im Panel window.prompt).
 * apply führt die Änderung aus (im Panel: Strich verwerfen, Eigenschaften abschließen, History-Schritt, melden).
 * false = unbekannter Frame oder abgebrochen.
 */
export function askFrameRename(
  frames: readonly Frame[], frameId: number,
  ask: (message: string, current: string) => string | null,
  apply: (frameId: number, name: string) => void,
): boolean {
  const frame = frames.find(f => f.id === frameId);
  if (!frame) return false;
  const name = ask(RENAME_PROMPT, frame.name ?? '');
  if (name === null) return false;
  apply(frameId, name);
  return true;
}
