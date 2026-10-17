import { describe, it, expect } from 'vitest';
import { writePico8 } from './pico8';
import type { ExportPlan, PlanSprite } from './plan';

function sprite(index: number, rows: number[][]): PlanSprite {
  const indices = new Uint8Array(64);
  rows.forEach((r, y) => r.forEach((v, x) => { indices[y * 8 + x] = v; }));
  return { index, w: 8, h: 8, indices, mapped: new Uint32Array(64), original: new Uint32Array(64) };
}
function plan(sprites: PlanSprite[]): ExportPlan {
  return { sprites, adjusted: 0, issues: [], dropped: 0, blocked: false };
}

describe('writePico8', () => {
  const head = 'pico-8 cartridge // http://www.pico-8.com\nversion 41\n__lua__\n__gfx__\n';

  it('Kopf, 128 Zeilen à 128 Hexzeichen, Zeilenumbruch am Ende', () => {
    const out = writePico8(plan([sprite(1, [[0, 1, 2, 3, 4, 5, 6, 7]])]));
    expect(out.startsWith(head)).toBe(true);
    expect(out.endsWith('\n')).toBe(true);
    const lines = out.slice(head.length).split('\n').slice(0, -1);
    expect(lines).toHaveLength(128);
    expect(lines.every(l => /^[0-9a-f]{128}$/.test(l))).toBe(true);
    expect(lines[0]).toBe('0'.repeat(8) + '01234567' + '0'.repeat(112));
  });

  it('Sprite 17 liegt in Zelle (1,1): Zeile 8 ab Spalte 8', () => {
    const out = writePico8(plan([sprite(17, [[9, 9, 9, 9, 9, 9, 9, 9]])]));
    const lines = out.slice(head.length).split('\n');
    expect(lines[8].slice(8, 16)).toBe('99999999');
    expect(lines[8].slice(0, 8)).toBe('00000000');
  });

  it('Indizes ab 10 als a–f, Sprite 255 in der letzten Zelle', () => {
    const out = writePico8(plan([sprite(255, [[10, 11, 12, 13, 14, 15, 0, 0]])]));
    const lines = out.slice(head.length).split('\n');
    expect(lines[120].slice(120, 128)).toBe('abcdef00');
  });
});
