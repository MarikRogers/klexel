import { Color } from '../model/Document';

const rgb = (hex: string): Color => ((parseInt(hex.slice(1), 16) << 8) | 0xff) >>> 0;

export const PICO8 = [
  '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
].map(rgb);

export const PALETTES: Record<string, Color[]> = { 'PICO-8': PICO8 };

export function toCss(c: Color): string {
  return `rgba(${c >>> 24},${(c >>> 16) & 255},${(c >>> 8) & 255},${(c & 255) / 255})`;
}
export function toHex(c: Color): string {
  return '#' + (c >>> 8).toString(16).padStart(6, '0');
}
export function fromHex(hex: string): Color { return rgb(hex); }
