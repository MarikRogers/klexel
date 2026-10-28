import type { ExportPlan } from './plan';

const SHEET = 128;
const CELLS_PER_ROW = 16;

/** Schreibt eine PICO-8-Kartusche (.p8) nur mit Sprite-Blatt (Kopf wie bei PICO-8 Version 41). */
export function writePico8(plan: ExportPlan): string {
  const sheet = new Uint8Array(SHEET * SHEET);
  for (const s of plan.sprites) {
    const ox = (s.index % CELLS_PER_ROW) * 8, oy = Math.floor(s.index / CELLS_PER_ROW) * 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) sheet[(oy + y) * SHEET + ox + x] = s.indices[y * 8 + x];
  }
  const lines: string[] = [];
  for (let y = 0; y < SHEET; y++) {
    let line = '';
    for (let x = 0; x < SHEET; x++) line += sheet[y * SHEET + x].toString(16);
    lines.push(line);
  }
  return 'pico-8 cartridge // http://www.pico-8.com\nversion 41\n__lua__\n__gfx__\n' + lines.join('\n') + '\n';
}
