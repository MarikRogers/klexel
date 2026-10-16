import type { PixelDocument } from '../model/Document';

export interface OnionFrames { prev: Uint32Array | null; next: Uint32Array | null }

/** Nachbarframes für die Onion-Skin-Anzeige; null, wenn aus oder nur ein Frame. Kein Umlauf. */
export function onionFrames(doc: PixelDocument): OnionFrames | null {
  if (!doc.onion || doc.frames.length < 2) return null;
  const i = doc.frameIndex(doc.currentFrameId);
  const prev = i > 0 ? doc.compositeFrame(doc.frames[i - 1].id) : null;
  const next = i < doc.frames.length - 1 ? doc.compositeFrame(doc.frames[i + 1].id) : null;
  return { prev, next };
}

export function nextPlaybackIndex(index: number, count: number): number {
  return count <= 0 ? 0 : (index + 1) % count;
}
