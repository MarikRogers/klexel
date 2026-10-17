import type { PixelDocument } from '../model/Document';

/** Hat irgendein Frame mindestens ein nicht vollständig transparentes Pixel? */
export function docHasContent(doc: PixelDocument): boolean {
  for (const f of doc.frames) {
    const px = doc.compositeFrame(f.id);
    for (let i = 0; i < px.length; i++) if ((px[i] & 255) !== 0) return true;
  }
  return false;
}
