import { Color } from '../model/Document';

/**
 * Picotron-Standardpalette (64 Farben).
 * PLATZHALTER: Die echten Werte stehen noch aus (nicht im Handbuch auffindbar).
 * Sie werden aus einem Screenshot der Picotron-Palette gelesen und hier ersetzt.
 * Bis dahin: Graustufenverlauf, Index 0 = Schwarz.
 */
export const PICOTRON_IS_PLACEHOLDER = true;

export const PICOTRON: Color[] = Array.from({ length: 64 }, (_, i) => {
  const v = Math.round((i * 255) / 63);
  return (((v << 24) | (v << 16) | (v << 8) | 0xff) >>> 0);
});
