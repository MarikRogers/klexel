// Öffentliche Schnittstelle des Klexel-Pakets für die Hülle.
// mountKlexel liegt bewusst NICHT hier: die Hülle lädt es per dynamischem Import aus '@suite/klexel/mount',
// damit der Editor ein eigener Chunk bleibt (ein Re-Export hier zöge ihn in das Start-Bundle).
export { PixelDocument, MAX_SIZE } from './model/Document';
export { PICO8 } from './palette/palettes';
export { encodeKlexel, decodeKlexel } from './storage/projectCodec';
export { readLegacyState } from './storage/storage';
export type { SavedState } from './storage/state';
export { showToast } from './ui/toast';
export { saveBlob } from './export/saveBlob';
