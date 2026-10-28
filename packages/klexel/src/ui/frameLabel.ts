import type { Frame } from '../model/Document';

/** Beschriftung einer Frame-Kachel: der Name, sonst die laufende Nummer (ab 1). */
export function frameLabel(frame: Frame, index: number): string {
  return frame.name ? frame.name : String(index + 1);
}
