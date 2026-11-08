import { PixelDocument, MAX_SIZE, MAX_FRAMES, type Color } from '../../model/Document';
import { PICO8 } from '../../palette/palettes';
import { PICOTRON } from '../../palette/picotron';
import type { ConsoleTarget } from './reduce';

/** Ein gelesenes Sprite: Palettenindizes (0 = durchsichtig), ein Byte je Pixel. */
export interface ImportSprite { index: number; w: number; h: number; indices: Uint8Array }
export interface ImportedSheet { target: ConsoleTarget; sprites: ImportSprite[] }
export type ImportMode = 'sheet' | 'frames';

const latin = new TextDecoder('latin1');

/** Entpackt einen einzelnen LZ4-Block (Pod-Container von Picotron). */
export function unlz4(src: Uint8Array, usize: number): Uint8Array {
  const out = new Uint8Array(usize);
  let p = 0, o = 0;
  while (p < src.length && o < usize) {
    const t = src[p++];
    let l = t >> 4;
    if (l === 15) { let b: number; do { b = src[p++]; l += b; } while (b === 255); }
    if (p + l > src.length || o + l > usize) throw new Error('Beschädigte Picotron-Datei');
    for (let i = 0; i < l; i++) out[o++] = src[p++];
    if (p >= src.length) break;
    const off = src[p] | (src[p + 1] << 8); p += 2;
    if (off === 0 || off > o) throw new Error('Beschädigte Picotron-Datei');
    let m = t & 15;
    if (m === 15) { let b: number; do { b = src[p++]; m += b; } while (b === 255); }
    m += 4;
    if (o + m > usize) throw new Error('Beschädigte Picotron-Datei');
    for (let i = 0; i < m; i++) { out[o] = out[o - off]; o++; }
  }
  return out;
}

/** Liest den Sprite-Teil (`__gfx__`) einer PICO-8-Kartusche (.p8) als 8×8-Sprites; leere Sprites entfallen. */
export function readPico8(text: string): ImportedSheet {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === '__gfx__');
  if (start < 0) throw new Error('Keine Sprites (__gfx__) in der Kartusche gefunden');
  const sheet = new Uint8Array(128 * 128);
  for (let y = 0; y < 128; y++) {
    const line = lines[start + 1 + y];
    if (line === undefined || line.startsWith('__')) break;
    for (let x = 0; x < 128 && x < line.length; x++) {
      const v = parseInt(line[x], 16);
      if (!Number.isNaN(v)) sheet[y * 128 + x] = v;
    }
  }
  const sprites: ImportSprite[] = [];
  for (let i = 0; i < 256; i++) {
    const ox = (i % 16) * 8, oy = Math.floor(i / 16) * 8;
    const indices = new Uint8Array(64);
    let any = false;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = sheet[(oy + y) * 128 + ox + x];
      indices[y * 8 + x] = v;
      if (v) any = true;
    }
    if (any) sprites.push({ index: i, w: 8, h: 8, indices });
  }
  return { target: 'pico8', sprites };
}

/**
 * Liest ein `pxu`-Bitmap (nach dem Präfix `pxu\0`): Flags (u16: Typ 0xf, Höhe 0x40, lange Größen 0x800,
 * Kompression 0xf000: 1 = roh, 2 = Move-to-front), Breite, Höhe, dann je Pixel ein Byte (u8).
 * Aufbau nach der Referenzimplementierung shrinko8 (picotron_fs.py).
 */
function readPxu(b: Uint8Array, at: number): { w: number; h: number; data: Uint8Array; next: number } {
  const bad = () => new Error('Beschädigtes oder nicht unterstütztes Picotron-Bitmap');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = at;
  if (p + 2 > b.length) throw bad();
  const flags = dv.getUint16(p, true); p += 2;
  const type = flags & 0xf, hasH = (flags & 0x40) !== 0, long = (flags & 0x800) !== 0, comp = flags >> 12;
  if (type !== 3) throw new Error('Nur 8-Bit-Bitmaps (u8) werden unterstützt');
  const num = (): number => {
    if (long) { if (p + 4 > b.length) throw bad(); const v = dv.getUint32(p, true); p += 4; return v; }
    if (p + 1 > b.length) throw bad();
    return b[p++];
  };
  const w = num(), h = hasH ? num() : 1;
  const size = w * h;
  if (w < 1 || h < 1 || size > 1 << 20) throw bad();
  const data = new Uint8Array(size);
  if (comp === 1) {
    if (p + size > b.length) throw bad();
    data.set(b.subarray(p, p + size)); p += size;
  } else if (comp === 2) {
    const bits = b[p++];
    if (bits !== 4) throw bad();
    const mask = (1 << bits) - 1, ext = 1 << (8 - bits);
    const mapping = Array.from({ length: mask }, (_, i) => i);
    const mtf = Array.from({ length: mask }, (_, i) => i);
    let n = 0;
    while (n < size) {
      if (p >= b.length) throw bad();
      const c = b[p++];
      const index = c & mask;
      let value: number;
      if (index === mask) {
        if (p >= b.length) throw bad();
        value = b[p++];
        mapping[mtf[mtf.length - 1]] = value; // ersetzt den am längsten ungenutzten Platz
      } else {
        const pos = mtf.indexOf(index);
        for (let i = pos; i > 0; i--) mtf[i] = mtf[i - 1];
        mtf[0] = index;
        value = mapping[index];
      }
      let count = 1 + (c >> bits);
      if (count === ext) {
        for (;;) { if (p >= b.length) throw bad(); const x = b[p++]; count += x; if (x !== 0xff) break; }
      }
      for (let i = 0; i < count && n < size; i++) data[n++] = value;
    }
  } else throw new Error('Nicht unterstützte Kompression im Picotron-Bitmap');
  return { w, h, data, next: p };
}

/** Liest eine Picotron-`.gfx` (Pod-Kopf, ggf. LZ4-Container, Lua-Tabelle mit `bmp=`-Einträgen). */
export function readPicotron(bytes: Uint8Array): ImportedSheet {
  const head = latin.decode(bytes.subarray(0, Math.min(bytes.length, 512)));
  if (!head.startsWith('--[[pod')) throw new Error('Keine Picotron-Grafikdatei (.gfx)');
  const end = head.indexOf(']]');
  if (end < 0) throw new Error('Keine Picotron-Grafikdatei (.gfx)');
  let body: Uint8Array = bytes.subarray(end + 2);
  if (latin.decode(body.subarray(0, 4)) === 'lz4\0') {
    if (body.length < 12) throw new Error('Beschädigte Picotron-Datei');
    const dv = new DataView(body.buffer, body.byteOffset + 4, 8);
    const csize = dv.getUint32(0, true), usize = dv.getUint32(4, true);
    if (usize > 64 * 1024 * 1024 || 12 + csize > body.length) throw new Error('Beschädigte Picotron-Datei');
    body = unlz4(body.subarray(12, 12 + csize), usize);
  }
  const text = latin.decode(body);
  const sprites: ImportSprite[] = [];
  let pos = 0, last = -1;
  for (;;) {
    const at = text.indexOf('bmp=', pos);
    if (at < 0) break;
    const before = text.slice(Math.max(0, at - 14), at);
    const m = /\[(\d+)\]=\{$/.exec(before);
    const index = m ? Number(m[1]) : last + 1;
    last = index;
    const d = at + 4;
    let w = 0, h = 0, data: Uint8Array | null = null, next = d;
    if (text.startsWith('pxu\0', d)) {
      const px = readPxu(body, d + 4);
      w = px.w; h = px.h; data = px.data; next = px.next;
    } else {
      const u = /^userdata\("u8",\s*(\d+),\s*(\d+),\s*"([0-9a-fA-F]*)"\)/.exec(text.slice(d, d + 20 + 128 * 128 * 2));
      if (u) {
        w = Number(u[1]); h = Number(u[2]);
        data = Uint8Array.from({ length: w * h }, (_, i) => parseInt(u[3].slice(i * 2, i * 2 + 2) || '0', 16));
        next = d + u[0].length;
      }
    }
    pos = Math.max(next, d);
    if (!data || w < 1 || h < 1 || data.length < w * h) continue;
    let any = false;
    for (let i = 0; i < data.length; i++) if (data[i]) { any = true; break; }
    if (any) sprites.push({ index, w, h, indices: Uint8Array.from(data) });
  }
  return { target: 'picotron', sprites };
}

/** Erkennt das Format am Inhalt und liest die Sprites. */
export function readConsoleFile(bytes: Uint8Array): ImportedSheet {
  const head = latin.decode(bytes.subarray(0, 16));
  if (head.startsWith('pico-8 cartridge')) return readPico8(latin.decode(bytes));
  if (head.startsWith('--[[pod')) return readPicotron(bytes);
  if (head.startsWith('\x89PNG')) throw new Error('PNG-Kartuschen (.p8.png) werden nicht unterstützt – bitte als .p8 speichern');
  throw new Error('Unbekanntes Format (erwartet: PICO-8 .p8 oder Picotron .gfx)');
}

const PALETTE: Record<ConsoleTarget, Color[]> = { pico8: PICO8, picotron: PICOTRON };

/** Größe der Zelle: größte Spritebreite/-höhe. */
export function cellOf(sheet: ImportedSheet): number {
  return sheet.sprites.reduce((m, s) => Math.max(m, s.w, s.h), 0) || 8;
}

/** Spalten, Zeilen und Größe des Blattbilds (Raster wie im Export: Sprite-Nummer bestimmt die Zelle). */
export function sheetLayout(sheet: ImportedSheet): { cell: number; cols: number; rows: number; width: number; height: number; cut: number } {
  const cell = cellOf(sheet);
  const cols = sheet.target === 'pico8' ? 16 : Math.max(1, Math.floor(MAX_SIZE / cell));
  const maxRows = Math.max(1, Math.floor(MAX_SIZE / cell));
  const needRows = Math.max(1, Math.ceil((sheet.sprites.reduce((m, s) => Math.max(m, s.index), 0) + 1) / cols));
  const rows = Math.min(needRows, maxRows);
  const cut = sheet.sprites.filter(s => Math.floor(s.index / cols) >= rows).length;
  return { cell, cols, rows, width: Math.min(MAX_SIZE, cols * cell), height: Math.min(MAX_SIZE, rows * cell), cut };
}

function put(cel: Uint32Array, width: number, height: number, ox: number, oy: number, s: ImportSprite, pal: Color[]): void {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const idx = s.indices[y * s.w + x];
    if (idx === 0 || idx >= pal.length) continue; // 0 = durchsichtig; unbekannte Farben ebenfalls
    const px = ox + x, py = oy + y;
    if (px < width && py < height) cel[py * width + px] = pal[idx];
  }
}

/**
 * Baut ein Klexel-Dokument aus den gelesenen Sprites.
 * - `sheet`: alle Sprites in einem Bild, angeordnet wie im Export (Sprite-Nummer = Zelle)
 * - `frames`: jedes Sprite wird ein Frame (höchstens MAX_FRAMES)
 */
export function buildImportDoc(sheet: ImportedSheet, mode: ImportMode): { doc: PixelDocument; dropped: number } {
  const pal = PALETTE[sheet.target];
  if (sheet.sprites.length === 0) throw new Error('Keine Sprites in der Datei gefunden');
  if (mode === 'sheet') {
    const l = sheetLayout(sheet);
    const doc = new PixelDocument(l.width, l.height);
    for (const s of sheet.sprites) {
      const col = s.index % l.cols, row = Math.floor(s.index / l.cols);
      if (row >= l.rows) continue;
      put(doc.data, l.width, l.height, col * l.cell, row * l.cell, s, pal);
    }
    return { doc, dropped: l.cut };
  }
  const cell = cellOf(sheet);
  const used = sheet.sprites.slice(0, MAX_FRAMES);
  const doc = new PixelDocument(cell, cell);
  used.forEach((s, i) => {
    const frame = i === 0 ? doc.frames[0] : doc.createFrame();
    if (i > 0) doc.insertFrame(frame, doc.frames.length);
    put(doc.ensureCel(doc.activeId, frame.id), cell, cell, 0, 0, s, pal);
  });
  doc.currentFrameId = doc.frames[0].id;
  return { doc, dropped: sheet.sprites.length - used.length };
}
