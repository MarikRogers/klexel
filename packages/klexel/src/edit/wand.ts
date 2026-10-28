import type { PixelDocument } from '../model/Document';
import { Selection, SelectionMode } from '../model/Selection';
import type { SelectionSession } from './SelectionSession';

/** Zauberstab-Tipp: erst absetzen, dann die Zelle lesen. Außerhalb der Fläche passiert nichts (auch kein Absetzen). */
export function wandSelect(session: SelectionSession, doc: PixelDocument, x: number, y: number, all: boolean, mode: SelectionMode): void {
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
  session.commit();
  const cel = doc.cel(doc.activeId, doc.currentFrameId);
  session.select(Selection.region(doc.width, doc.height, cel, x, y, !all), mode);
}
