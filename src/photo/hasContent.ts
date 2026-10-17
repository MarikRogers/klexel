import type { PixelDocument } from '../model/Document';

/** Hat irgendeine Ebene in irgendeinem Frame ein nicht vollständig transparentes Pixel (auch versteckte Ebenen)? */
export function docHasContent(doc: PixelDocument): boolean {
  for (const layer of doc.layers) {
    for (const f of doc.frames) {
      const cel = layer.cels.get(f.id);
      if (!cel) continue;
      for (let i = 0; i < cel.length; i++) if ((cel[i] & 255) !== 0) return true;
    }
  }
  return false;
}
