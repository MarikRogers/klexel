// Vorläufiger Einstieg bis zur Hülle (Task 5): hängt Klexel direkt in #app ein und speichert wie bisher
// einen einzigen Stand über saveState/loadState. Die Hülle ersetzt das durch den Workspace.
import './style.css';
import { PixelDocument } from './model/Document';
import { mountKlexel } from './klexel';
import type { AreaHost, NewProjectInit } from './area';
import { encodeKlexel, decodeKlexel } from './storage/projectCodec';
import { saveState, loadState } from './storage/storage';
import { docHasContent } from './photo/hasContent';

const root = document.getElementById('app')!;

function blankState(init: NewProjectInit, palette: number[], color: number) {
  const doc = new PixelDocument(init.width, init.height);
  if (init.image) doc.data.set(init.image.pixels);
  return encodeKlexel(doc, palette, color);
}

async function start(): Promise<void> {
  // Erst den gespeicherten Stand laden, dann einhängen (ein Link-Dialog erscheint wie bisher danach)
  const saved = await loadState().catch(err => { console.error(err); return null; });
  const host: AreaHost = {
    onChange: () => {
      const s = decodeKlexel(handle.snapshot());
      if (s) void saveState(s.doc, s.palette, s.color);
    },
    requestNewProject: init => {
      const cur = decodeKlexel(handle.snapshot())!;
      // Nur ein Speicherplatz bis zur Hülle: ein Bild aus einem Link ersetzt nicht ungefragt den Bestand
      if (init?.image && docHasContent(cur.doc) && !confirm('Das aktuelle Bild wird ersetzt. Fortfahren?')) return;
      handle.open(blankState(init ?? { width: 32, height: 32 }, cur.palette, cur.color));
      host.onChange();
    },
    isActive: () => true,
  };
  const handle = mountKlexel(root, host);
  if (saved) handle.open(encodeKlexel(saved.doc, saved.palette, saved.color));
}

void start();
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
