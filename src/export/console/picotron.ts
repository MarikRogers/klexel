import type { ExportPlan, PlanSprite } from './plan';

const ENTRIES = 256;
const TAIL = 'flags=0,pan_x=0,pan_y=0,zoom=8';

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function hexOf(indices: Uint8Array): string {
  let s = '';
  for (let i = 0; i < indices.length; i++) s += indices[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * Schreibt eine Picotron-`.gfx` in unkomprimierter Textform (256 Einträge).
 * UNGEPRÜFT: Ob Picotron diese Form lädt, klärt Task 6 (Vergleich mit einer echten Datei: LZ4-Pod).
 */
export function writePicotron(plan: ExportPlan, cell: number, now: Date = new Date()): string {
  const byIndex = new Map<number, PlanSprite>();
  for (const s of plan.sprites) if (s.index < ENTRIES) byIndex.set(s.index, s);
  const entries: string[] = [];
  for (let i = 0; i < ENTRIES; i++) {
    const s = byIndex.get(i);
    const bmp = s
      ? `userdata("u8",${s.w},${s.h},"${hexOf(s.indices)}")`
      : `userdata("u8",${cell},${cell})`;
    entries.push(`${i === 0 ? '[0]=' : ''}{bmp=${bmp},${TAIL}}`);
  }
  const t = stamp(now);
  return `--[[pod_format="raw",created="${t}",modified="${t}",revision=1]]{${entries.join(',')}}`;
}

/** Nur für die manuelle Palettenprüfung (Task 6): Sprite k (1..63) einfarbig in Palettenindex k. */
export function picotronPaletteTest(): ExportPlan {
  const sprites: PlanSprite[] = [];
  for (let k = 1; k <= 63; k++) {
    sprites.push({
      index: k, w: 16, h: 16,
      indices: new Uint8Array(256).fill(k), mapped: new Uint32Array(256), original: new Uint32Array(256),
    });
  }
  return { sprites, adjusted: 0, issues: [], dropped: 0, blocked: false };
}
