/** German UI texts that are shown from more than one place. */

export const unsupportedImage = (fileName: string): string => `${fileName} ist kein unterstütztes Bild`;
export const INVALID_JSON = 'Die Datei ist kein gültiges JSON.';
export const FILE_UNREADABLE = 'Die Datei konnte nicht gelesen werden.';
export const IMAGE_LOAD_FAILED = 'Bild konnte nicht geladen werden.';
export const WEBGL2_UNSUPPORTED = 'WebGL2 wird von diesem Browser nicht unterstützt.';
export const CANVAS_UNSUPPORTED = 'Canvas wird von diesem Browser nicht unterstützt.';
export const NO_ANIMATION_SELECTED = 'Keine Animation ausgewählt';

/** Message of a caught value, whatever was thrown. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
