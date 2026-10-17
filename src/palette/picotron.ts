import { Color } from '../model/Document';

const rgb = (hex: string): Color => ((parseInt(hex.slice(1), 16) << 8) | 0xff) >>> 0;

/**
 * Picotron-Standardpalette, wie sie der Sprite-Editor anbietet: 32 Farben (8 Spalten × 4 Zeilen,
 * Index zeilenweise). Aus einem Screenshot des Picotron-Sprite-Editors gelesen (2026-10-18).
 * Picotron kennt bis zu 64 definierbare Farben; die Indizes 32–63 bietet der Editor nicht an
 * und werden hier nicht verwendet.
 */
export const PICOTRON: Color[] = [
  '#000000', '#703233', '#ab5236', '#f49671', '#ffccaa', '#ff004d', '#b9003e', '#7e2553',
  '#432932', '#5f574f', '#a28879', '#c2c3c7', '#fff1e8', '#ffacc5', '#ff77a8', '#e40dab',
  '#1d2b53', '#2463b0', '#00a5a1', '#29adff', '#64dff6', '#bd9adf', '#83769c', '#654688',
  '#125359', '#008751', '#00b251', '#00e436', '#95f04b', '#ffec27', '#ffa300', '#e26b13',
].map(rgb);
