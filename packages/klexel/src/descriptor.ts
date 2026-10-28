// Leichte Beschreibung des Bereichs Klexel für die Hülle (ohne den Editor; der kommt erst mit load()).
import type { AreaDescriptor, NewProjectInit } from '@suite/shared';
import { PixelDocument } from './model/Document';
import { PICO8 } from './palette/palettes';
import { encodeKlexel, decodeKlexel } from './storage/projectCodec';
import { readLegacyState } from './storage/storage';
import { changeKey } from './storage/changeKey';
import type { SavedState } from './storage/state';
import { AREA_MARKER } from './marker';

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
};
