// Öffentliche Schnittstelle des Klexel-Pakets für die Hülle.
// Der Editor (mountKlexel) liegt bewusst NICHT hier: klexelDescriptor.load() lädt ihn per dynamischem Import,
// damit er ein eigener Chunk bleibt (ein Re-Export hier zöge ihn in das Start-Bundle).
export { klexelDescriptor } from './descriptor';
export { AREA_MARKER } from './marker';
export { PixelDocument, MAX_SIZE } from './model/Document';
export { PICO8 } from './palette/palettes';
export { encodeKlexel, decodeKlexel } from './storage/projectCodec';
export { changeKey } from './storage/changeKey';
export { readLegacyState } from './storage/storage';
export type { SavedState } from './storage/state';
