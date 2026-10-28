// Leichte Beschreibung des Bereichs Klexel für die Hülle (ohne den Editor; der kommt erst mit load()).
import type { AreaDescriptor, FramesDocInput, NewProjectInit, PixelFrame } from '@suite/shared';
import { compositeLayers } from '@suite/shared';
import { PixelDocument, MAX_FRAMES, MAX_NAME, MAX_SIZE } from './model/Document';
import { PICO8 } from './palette/palettes';
import { encodeKlexel, decodeKlexel } from './storage/projectCodec';
import { readLegacyState } from './storage/storage';
import { changeKey } from './storage/changeKey';
import type { SavedState } from './storage/state';
import { AREA_MARKER } from './marker';
import { isShareLinkHash } from './share/linkHash';

const DEFAULT_INIT: NewProjectInit = { width: 32, height: 32 };

export const klexelDescriptor: AreaDescriptor<SavedState> & { marker: string } = {
  kind: 'klexel',
  title: 'Klexel',
  marker: AREA_MARKER,
  load: () => import('./klexelArea').then(m => m.klexelArea),
  blank(init = DEFAULT_INIT, previous) {
    // Palette und Farbe des bisherigen Projekts übernehmen, sonst PICO-8 mit deren neunter Farbe
    const cur = previous ? decodeKlexel(previous) : null;
    const palette = cur?.palette ?? [...PICO8];
    const color = cur?.color ?? palette[8] ?? 0xffffffff;
    const doc = new PixelDocument(init.width, init.height);
    if (init.image) doc.data.set(init.image.pixels);
    return encodeKlexel(doc, palette, color);
  },
  decode: raw => (decodeKlexel(raw) ? (raw as SavedState) : null),
  changeKey,
  // Für die Übernahme: nur ein lesbarer Alt-Stand wird übernommen (Unlesbares nicht)
  async readLegacy() {
    const raw = await readLegacyState();
    return raw !== null && decodeKlexel(raw) ? raw : null;
  },
  legacyName: 'Mein Bild',
  newProjectSize: true,
  framesOf: payload => framesOfKlexel(payload),
  fromFrames: input => klexelFromFrames(input),
  // Geteilter Link (#i=…): die Hülle wechselt zu Klexel, Klexel öffnet den Link-Dialog
  handlesHash: isShareLinkHash,
};

/** Gültige Bildrate von Klexel (Regler und Prüfung beim Laden). */
const MIN_FPS = 1, MAX_FPS = 30;

/**
 * Neues Klexel-Dokument aus Einzelbildern (Rigsprite → Klexel): eine Ebene „Ebene 1", ein Frame je Bild (Pixel
 * kopiert), Frame-Name = angegebener Name, sonst „<name> <n>" (höchstens MAX_NAME Zeichen), fps auf 1..30 begrenzt,
 * Palette PICO-8 wie bei blank. RangeError bei Größe außerhalb 1..128 oder Frame-Anzahl außerhalb 1..64 oder
 * Pixeldaten, die nicht zur Größe passen.
 */
export function klexelFromFrames(input: FramesDocInput): ReturnType<typeof encodeKlexel> {
  const { width, height, frames } = input;
  const sizeOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_SIZE;
  if (!sizeOk(width) || !sizeOk(height)) throw new RangeError(`Größe muss 1..${MAX_SIZE} sein`);
  if (frames.length < 1 || frames.length > MAX_FRAMES) throw new RangeError(`Frameanzahl muss 1..${MAX_FRAMES} sein`);
  for (const f of frames) {
    if (!(f.pixels instanceof Uint32Array) || f.pixels.length !== width * height) {
      throw new RangeError('Pixeldaten passen nicht zur Größe');
    }
  }
  const doc = new PixelDocument(width, height);
  const layerId = doc.activeId;
  const base = input.name.trim() || 'Frame';
  frames.forEach((f, i) => {
    let frameId = doc.currentFrameId;
    if (i > 0) {
      const frame = doc.createFrame();
      doc.insertFrame(frame, i);
      frameId = frame.id;
    }
    doc.ensureCel(layerId, frameId).set(f.pixels); // Kopie, kein Verweis auf die Eingabe
    const given = f.name.trim();
    const n = String(i + 1);
    doc.renameFrame(frameId, given || `${base.slice(0, MAX_NAME - n.length - 1).trim()} ${n}`);
  });
  doc.setCurrentFrame(doc.frames[0].id);
  const fps = Number.isFinite(input.fps) ? Math.round(input.fps) : 8;
  doc.fps = Math.min(MAX_FPS, Math.max(MIN_FPS, fps));
  const palette = [...PICO8];
  return encodeKlexel(doc, palette, palette[8] ?? 0xffffffff);
}

/**
 * Frames eines Klexel-Stands für Rigsprite: je Frame die sichtbaren Ebenen zusammengerechnet (wie PNG-Export),
 * in Originalgröße; Name = Frame-Name, sonst „Frame <n>" (n = Position). null = nicht lesbar. Der Stand trägt
 * keinen eigenen Namen (der steht in der Projektliste), daher name = ''.
 */
export function framesOfKlexel(raw: unknown): { name: string; frames: PixelFrame[] } | null {
  let decoded;
  try { decoded = decodeKlexel(raw); } catch { return null; }
  if (!decoded) return null;
  const { doc } = decoded;
  const length = doc.width * doc.height;
  const frames = doc.frames.map((f, i): PixelFrame => ({
    frameId: f.id,
    name: f.name || `Frame ${i + 1}`,
    width: doc.width,
    height: doc.height,
    pixels: compositeLayers(doc.layers.map(l => ({ visible: l.visible, opacity: l.opacity, cel: l.cels.get(f.id) })), length),
  }));
  return { name: '', frames };
}
