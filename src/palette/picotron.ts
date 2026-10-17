import { Color } from '../model/Document';

const rgb = (hex: string): Color => ((parseInt(hex.slice(1), 16) << 8) | 0xff) >>> 0;

/**
 * Picotron-Standardpalette (32 Farben) in der Indexreihenfolge, die das Sprite-Blatt von Picotron zeigt
 * (8 Sprites je Zeile, Sprite k = Farbindex k; gelesen aus einem Screenshot am 2026-10-18).
 * Die Indizes 0–15 entsprechen der PICO-8-Palette. Picotron kennt bis zu 64 definierbare Farben; die
 * Indizes 32–63 bietet der Editor nicht an und werden hier nicht verwendet.
 * Achtung: Die Farbfelder im Palettenfenster des Editors stehen in anderer Reihenfolge als die Indizes.
 */
export const PICOTRON: Color[] = [
  '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
  '#2463b0', '#00a5a1', '#654688', '#125359', '#703233', '#432932', '#a28879', '#ffacc5',
  '#b9003e', '#e26b13', '#95f04b', '#00b251', '#64dff6', '#bd9adf', '#e40dab', '#f49671',
].map(rgb);
