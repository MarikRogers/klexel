import type { PixelDocument } from '../model/Document';
import { serializeState, parseState, type SavedState } from './state';

export function encodeKlexel(doc: PixelDocument, palette: number[], color: number): SavedState {
  return serializeState(doc, palette, color);
}

export function decodeKlexel(raw: unknown): { doc: PixelDocument; palette: number[]; color: number } | null {
  return parseState(raw);
}
