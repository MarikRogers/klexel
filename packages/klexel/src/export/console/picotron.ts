import type { ExportPlan, PlanSprite } from './plan';

const ENTRIES = 256;
const TAIL = 'flags=0,pan_x=0,pan_y=0,zoom=8';

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const ascii = (t: string): Uint8Array => Uint8Array.from(t, c => c.charCodeAt(0));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Ein Sprite-Bitmap im binären pxu-Format: `pxu\0`, Typ 2D-u8, RAW (unkomprimiert), Breite, Höhe, ein Byte je Pixel. */
function pxu(w: number, h: number, indices: Uint8Array | null): Uint8Array {
  const data = indices ?? new Uint8Array(w * h);
  return concat([Uint8Array.of(0x70, 0x78, 0x75, 0x00, 0x43, 0x10, w, h), data]);
}

/** LZ4-Block, der nur aus Rohdaten besteht (gültig, aber ohne Kompression). */
function lz4Literal(src: Uint8Array): Uint8Array {
  const n = src.length;
  const token: number[] = [];
  if (n < 15) token.push(n << 4);
  else {
    token.push(15 << 4);
    let r = n - 15;
    while (r >= 255) { token.push(255); r -= 255; }
    token.push(r);
  }
  return concat([Uint8Array.from(token), src]);
}

/**
 * Schreibt eine Picotron-`.gfx`: Kommentarkopf, dann Pod-Container `lz4\0` + Größen + Block
 * (Aufbau wie in einer echten, von Picotron gespeicherten Datei). Der Inhalt ist eine Lua-Tabelle mit
 * 256 Einträgen; die Bitmaps stehen unkomprimiert im pxu-Format.
 */
export function writePicotron(plan: ExportPlan, cell: number, now: Date = new Date()): Uint8Array {
  const byIndex = new Map<number, PlanSprite>();
  for (const s of plan.sprites) if (s.index < ENTRIES) byIndex.set(s.index, s);
  const parts: Uint8Array[] = [ascii('{')];
  for (let i = 0; i < ENTRIES; i++) {
    const s = byIndex.get(i);
    parts.push(
      ascii((i === 0 ? '[0]=' : ',') + '{bmp='),
      s ? pxu(s.w, s.h, s.indices) : pxu(cell, cell, null),
      ascii(`,${TAIL}}`),
    );
  }
  parts.push(ascii('}'));
  const body = concat(parts);
  const block = lz4Literal(body);
  const sizes = new Uint8Array(8);
  const dv = new DataView(sizes.buffer);
  dv.setUint32(0, block.length, true); dv.setUint32(4, body.length, true);
  const t = stamp(now);
  return concat([ascii(`--[[pod,created="${t}",modified="${t}",revision=1]]lz4\0`), sizes, block]);
}

/** Nur für die manuelle Palettenprüfung (Task 6): Sprite k (1..31) einfarbig in Palettenindex k. */
export function picotronPaletteTest(): ExportPlan {
  const sprites: PlanSprite[] = [];
  for (let k = 1; k <= 31; k++) {
    sprites.push({
      index: k, w: 16, h: 16,
      indices: new Uint8Array(256).fill(k), mapped: new Uint32Array(256), original: new Uint32Array(256),
    });
  }
  return { sprites, adjusted: 0, issues: [], dropped: 0, blocked: false };
}
