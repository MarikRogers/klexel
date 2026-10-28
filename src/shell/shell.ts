// Hülle (nur Browser): Workspace öffnen, Bestand übernehmen, Klexel einhängen, Projekte wechseln und automatisch sichern.
import './shell.css';
import type { AreaHandle, AreaHost, NewProjectInit } from '../area';
import type { SavedState } from '../storage/state';
import { PixelDocument } from '../model/Document';
import { PICO8 } from '../palette/palettes';
import { encodeKlexel, decodeKlexel } from '../storage/projectCodec';
import { readLegacyState } from '../storage/storage';
import { WorkspaceStore } from '../workspace/store';
import { IdbBackend } from '../workspace/idbBackend';
import { migrateLegacy } from '../workspace/migrateLegacy';
import type { ProjectMeta } from '../workspace/types';
import { showToast } from '../ui/toast';
import { createAutosave } from './autosave';
import { nextUntitledName } from './listModel';
import { snapshotKey } from './snapshotKey';
import { createProjectList } from './projectList';

export interface Shell {
  /** Wechselt zum Projekt id: offene Bearbeitung absetzen, sichern, dann laden und öffnen. Läuft eingereiht, nie parallel. */
  switchProject(id: string): Promise<void>;
}

const canOpen = (m: ProjectMeta) => m.kind === 'klexel';

function blankPayload(init: NewProjectInit, palette: number[] = [...PICO8], color = palette[8] ?? 0xffffffff): SavedState {
  const doc = new PixelDocument(init.width, init.height);
  if (init.image) doc.data.set(init.image.pixels);
  return encodeKlexel(doc, palette, color);
}

// Für die Übernahme: nur ein lesbarer Alt-Stand wird übernommen (Unlesbares nicht)
async function readLegacyKlexel(): Promise<unknown | null> {
  const raw = await readLegacyState();
  return raw !== null && decodeKlexel(raw) ? raw : null;
}

export async function startShell(app: HTMLElement): Promise<Shell> {
  const kv = new IdbBackend();
  const store = new WorkspaceStore(kv);

  try {
    await migrateLegacy(store, kv, readLegacyKlexel);
  } catch (err) {
    console.error('Übernahme des alten Stands fehlgeschlagen', err);
  }

  // Erst den Stand laden, dann einhängen, dann öffnen (der Link-Dialog prüft beim Einhängen)
  let currentId: string | null = null;
  let initial: { id: string; payload: unknown; hasThumbnail: boolean } | null = null;
  try {
    const last = await store.lastOpened();
    const metas = (await store.list()).filter(canOpen);
    // Zuletzt geöffnetes zuerst, sonst das zuletzt geänderte; Unlesbares wird übersprungen
    const order = [...metas.filter(m => m.id === last), ...metas.filter(m => m.id !== last)];
    for (const m of order) {
      const p = await store.load(m.id);
      if (decodeKlexel(p)) { initial = { id: m.id, payload: p, hasThumbnail: !!m.thumbnail }; break; }
      console.error(`Projekt ${m.id} ist nicht lesbar und wird übersprungen`);
    }
    if (!initial) {
      const payload = blankPayload({ width: 32, height: 32 });
      const meta = await store.create('klexel', nextUntitledName(metas.map(m => m.name)), payload);
      initial = { id: meta.id, payload, hasThumbnail: false };
    }
  } catch (err) {
    // Ohne Speicher trotzdem bedienbar bleiben (Änderungen gehen dann beim Schließen verloren)
    console.error('Workspace nicht lesbar', err);
    showToast('Projekte konnten nicht geladen werden', 4000);
  }

  let switching = false;
  // Zuletzt gesicherter (oder geöffneter) Stand des offenen Projekts
  let saved: { id: string; key: string } | null = null;
  let list: ReturnType<typeof createProjectList> | undefined;
  let handle!: AreaHandle<SavedState>;
  const autosave = createAutosave({
    // Klexel meldet Änderungen bereits entprellt (500 ms); hier nur kurz bündeln, damit das Fenster bis zum
    // Schreiben klein bleibt (beim Neuladen/Schließen bricht der Browser offene IndexedDB-Aufträge ab)
    delayMs: 50,
    save: async () => {
      const id = currentId;
      if (!id) return;
      // flush() ruft vorher der Auslöser auf (Klexel meldet onChange erst nach abgeschlossener Bearbeitung)
      const payload = handle.snapshot();
      // Klexel meldet beim Absetzen (flush) immer eine Änderung; ohne echte Änderung nicht schreiben,
      // sonst springt das Datum schon beim bloßen Öffnen und Wechseln nach vorn
      const key = snapshotKey(payload);
      if (saved?.id === id && saved.key === key) return;
      const thumbnail = handle.thumbnail();
      await store.save(id, payload, thumbnail ? { thumbnail } : undefined);
      saved = { id, key };
      list?.refresh();
    },
    onError: err => {
      console.error('Speichern fehlgeschlagen', err);
      showToast('Speichern fehlgeschlagen', 3000);
    },
  });
  const host: AreaHost = {
    onChange: () => autosave.schedule(),
    requestNewProject: init => { void newProject(init ?? { width: 32, height: 32 }); },
    isActive: () => true,
  };

  const { mountKlexel } = await import('../klexel');
  handle = mountKlexel(app, host);

  /** Öffnet einen geladenen Stand; ohne Vorschau wird beim nächsten Sichern einmal geschrieben (erzeugt sie). */
  function show(id: string, payload: unknown, hasThumbnail: boolean): void {
    handle.open(payload as SavedState);
    currentId = id;
    saved = hasThumbnail ? { id, key: snapshotKey(handle.snapshot()) } : null;
  }

  if (initial) {
    show(initial.id, initial.payload, initial.hasThumbnail);
    void store.setLastOpened(initial.id).catch(err => console.error(err));
  }

  // Eine Warteschlange für alles, was das offene Projekt austauscht oder löscht
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      switching = true;
      document.body.classList.add('shell-busy');
      try { return await fn(); } finally {
        switching = false;
        document.body.classList.remove('shell-busy');
      }
    });
    queue = run.catch(() => undefined);
    return run;
  }

  /** Offene Bearbeitung absetzen und sichern; wirft, wenn das Sichern scheitert (dann nicht wechseln). */
  async function saveCurrent(): Promise<void> {
    handle.flush();
    await autosave.flush();
  }

  async function openLoaded(id: string, payload: unknown, hasThumbnail?: boolean): Promise<void> {
    if (hasThumbnail === undefined) hasThumbnail = !!(await store.list()).find(m => m.id === id)?.thumbnail;
    show(id, payload, hasThumbnail);
    await store.setLastOpened(id);
  }

  async function createAndOpen(init: NewProjectInit, base?: SavedState): Promise<void> {
    const cur = base ? decodeKlexel(base) : null;
    const payload = blankPayload(init, cur?.palette, cur?.color);
    const names = (await store.list()).map(m => m.name);
    const meta = await store.create('klexel', nextUntitledName(names), payload);
    await openLoaded(meta.id, payload, false);
    autosave.schedule(); // Vorschau erzeugen
  }

  function switchProject(id: string): Promise<void> {
    return enqueue(async () => {
      if (id === currentId) return;
      try { await saveCurrent(); } catch {
        showToast('Speichern fehlgeschlagen – Projekt nicht gewechselt', 3000);
        throw new Error('Wechsel abgebrochen');
      }
      const payload = await store.load(id);
      if (!decodeKlexel(payload)) {
        showToast('Projekt ist nicht lesbar', 3000);
        throw new Error(`Projekt ${id} nicht lesbar`);
      }
      await openLoaded(id, payload);
    });
  }

  // Neues Projekt (Klexels „Neu", Link „In Klexel bearbeiten", Projektliste); das aktuelle bleibt erhalten
  function newProject(init: NewProjectInit): Promise<void> {
    return enqueue(async () => {
      try { await saveCurrent(); } catch {
        showToast('Speichern fehlgeschlagen – kein neues Projekt angelegt', 3000);
        throw new Error('Neues Projekt abgebrochen');
      }
      await createAndOpen(init, handle.snapshot());
    }).catch(err => console.error(err));
  }

  function removeProject(id: string): Promise<void> {
    return enqueue(async () => {
      if (id !== currentId) { await store.remove(id); return; }
      // Das offene Projekt: nichts mehr dafür speichern, dann ein anderes öffnen oder ein leeres anlegen
      const base = handle.snapshot();
      currentId = null;
      autosave.cancel();
      await autosave.flush().catch(() => undefined); // laufenden Schreibvorgang abwarten
      await store.remove(id);
      for (const m of (await store.list()).filter(canOpen)) {
        const payload = await store.load(m.id);
        if (decodeKlexel(payload)) { await openLoaded(m.id, payload, !!m.thumbnail); return; }
      }
      await createAndOpen({ width: 32, height: 32 }, base);
    });
  }

  function duplicateProject(id: string): Promise<void> {
    return enqueue(async () => {
      if (id === currentId) await saveCurrent(); // Duplikat mit dem neuesten Stand
      await store.duplicate(id);
    });
  }

  list = createProjectList({
    list: () => store.list(),
    currentId: () => currentId,
    canOpen,
    open: switchProject,
    rename: (id, name) => store.rename(id, name),
    duplicate: duplicateProject,
    remove: removeProject,
    create: (width, height) => newProject({ width, height }),
  });

  // Knopf „Projekte" neben der Marke in Klexels Kopfleiste
  const btn = document.createElement('button');
  btn.id = 'projectsBtn';
  btn.type = 'button';
  btn.title = 'Projekte';
  btn.setAttribute('aria-label', 'Projekte');
  btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h7l2 2h9v11H2z"/></svg>`;
  btn.onclick = () => { handle.flush(); list?.open(); };
  document.getElementById('brand')?.after(btn);

  // Beim Verstecken/Schließen sofort sichern (Klexels eigener Listener meldet vorher onChange)
  const flushNow = () => {
    if (switching) return; // ein Wechsel sichert selbst
    handle.flush();
    autosave.flush().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
  window.addEventListener('pagehide', flushNow);

  return { switchProject };
}
