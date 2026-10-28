// Hülle (nur Browser): Workspace öffnen, Bestand übernehmen, den Bereich einhängen, Projekte wechseln und automatisch sichern.
// Alles Bereichs-Spezifische (leere Projekte, Lesbarkeit, Änderungserkennung, Alt-Stand, Einhängen) kommt über die
// Bereichs-Beschreibungen (AreaDescriptor); die Hülle importiert kein Bereichs-Paket.
import './shell.css';
import type { AreaDescriptor, AreaHandle, AreaHost, NewProjectInit, ProjectMeta } from '@suite/shared';
import { WorkspaceStore, IdbBackend, migrateLegacy } from '@suite/shared';
import { showToast } from '@suite/shared/ui';
import { createAutosave } from './autosave';
import { nextUntitledName, afterRemoveError, isOpenable } from './listModel';
import { createProjectList } from './projectList';
import { createFileActions } from './fileMenu';

export interface Shell {
  /** Wechselt zum Projekt id: offene Bearbeitung absetzen, sichern, dann laden und öffnen. Läuft eingereiht, nie parallel. */
  switchProject(id: string): Promise<void>;
}

const BLANK: NewProjectInit = { width: 32, height: 32 };

/**
 * Startet die Hülle mit den Bereichen dieses Builds. Vorerst wird genau ein Bereich eingehängt (der erste);
 * Projekte anderer Arten bleiben erhalten und sind in der Liste als „nicht verfügbar" gekennzeichnet.
 */
export async function startShell(app: HTMLElement, descriptors: readonly AreaDescriptor<unknown>[]): Promise<Shell> {
  const area = descriptors[0];
  if (!area) throw new Error('Kein Bereich in diesem Build enthalten');
  const byKind = (kind: string) => descriptors.find(d => d.kind === kind);
  const canOpen = (m: ProjectMeta) => isOpenable(m, [area.kind]);
  // Editor schon laden, während der Workspace gelesen wird (eigener Chunk)
  const areaModule = area.load();
  areaModule.catch(() => undefined); // Fehler erst beim Einhängen melden

  const kv = new IdbBackend();
  const store = new WorkspaceStore(kv);

  for (const d of descriptors) {
    if (!d.readLegacy) continue;
    try {
      await migrateLegacy(store, kv, () => d.readLegacy!(), { kind: d.kind, name: d.legacyName });
    } catch (err) {
      console.error('Übernahme des alten Stands fehlgeschlagen', err);
    }
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
      if (area.decode(p) !== null) { initial = { id: m.id, payload: p, hasThumbnail: !!m.thumbnail }; break; }
      console.error(`Projekt ${m.id} ist nicht lesbar und wird übersprungen`);
    }
    if (!initial) {
      const payload = area.blank(BLANK);
      const meta = await store.create(area.kind, nextUntitledName(metas.map(m => m.name)), payload);
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
  let handle!: AreaHandle<unknown>;
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
      const key = area.changeKey(payload);
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
    requestNewProject: init => { void newProject(init ?? BLANK); },
    // Während eines Wechsels inaktiv: Klexel ignoriert dann Tastenkürzel (und merkt Größenänderungen nur vor)
    isActive: () => !switching,
  };

  handle = (await areaModule).mount(app, host);

  /** Öffnet einen geladenen Stand; ohne Vorschau wird beim nächsten Sichern einmal geschrieben (erzeugt sie). */
  function show(id: string, payload: unknown, hasThumbnail: boolean): void {
    handle.open(payload);
    currentId = id;
    saved = hasThumbnail ? { id, key: area.changeKey(handle.snapshot()) } : null;
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
        handle.setActive(true); // vorgemerkte Größenänderung nachholen
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

  async function createAndOpen(init: NewProjectInit, base?: unknown): Promise<void> {
    const payload = area.blank(init, base);
    const names = (await store.list()).map(m => m.name);
    const meta = await store.create(area.kind, nextUntitledName(names), payload);
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
      if (area.decode(payload) === null) {
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
      try {
        await autosave.flush().catch(() => undefined); // laufenden Schreibvorgang abwarten
        await store.remove(id);
        await openFallback(base);
      } catch (err) {
        console.error('Löschen fehlgeschlagen', err);
        const after = await store.list().catch(() => null);
        if (afterRemoveError(id, after) === 'restore') {
          // Projekt existiert noch: weiter bearbeiten und die verworfene Änderung erneut vormerken
          currentId = id;
          autosave.schedule();
          showToast('Löschen fehlgeschlagen – das Projekt bleibt erhalten', 3000);
        } else {
          showToast('Fehler nach dem Löschen – ein anderes Projekt wird geöffnet', 3000);
          try { await openFallback(base); } catch (err2) {
            // Letzter Ausweg: geöffnet lassen; Sichern auf die gelöschte ID ist ein No-op
            console.error(err2);
            currentId = id;
            showToast('Kein anderes Projekt konnte geöffnet werden', 4000);
          }
        }
        throw err;
      }
    });
  }

  /** Nächstes lesbares Projekt des eingehängten Bereichs öffnen, sonst ein leeres anlegen. */
  async function openFallback(base: unknown): Promise<void> {
    for (const m of (await store.list()).filter(canOpen)) {
      const payload = await store.load(m.id);
      if (area.decode(payload) !== null) { await openLoaded(m.id, payload, !!m.thumbnail); return; }
    }
    await createAndOpen(BLANK, base);
  }

  function duplicateProject(id: string): Promise<void> {
    return enqueue(async () => {
      if (id === currentId) await saveCurrent(); // Duplikat mit dem neuesten Stand
      await store.duplicate(id);
    });
  }

  const files = createFileActions({
    store,
    prepare: () => enqueue(saveCurrent),
    // Arten ohne Bereich in diesem Build werden unverändert übernommen (und sind dann „nicht verfügbar")
    isKnownKind: kind => byKind(kind) !== undefined,
    validatePayload: (kind, payload) => { const d = byKind(kind); return !d || d.decode(payload) !== null; },
  });

  list = createProjectList({
    list: () => store.list(),
    currentId: () => currentId,
    canOpen,
    open: switchProject,
    rename: (id, name) => store.rename(id, name),
    duplicate: duplicateProject,
    remove: removeProject,
    create: (width, height) => newProject({ width, height }),
    exportAll: files.exportAll,
    exportOne: m => files.exportOne(m.id, m.name),
    importFile: async f => { await files.importFile(f); },
  });

  // Knopf „Projekte" neben der Marke in Klexels Kopfleiste
  const btn = document.createElement('button');
  btn.id = 'projectsBtn';
  btn.type = 'button';
  btn.title = 'Projekte';
  btn.setAttribute('aria-label', 'Projekte');
  btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h7l2 2h9v11H2z"/></svg>`;
  btn.onclick = () => { handle.flush(); list?.open(); };
  // Kopplung an Klexels Kopfleiste: setzt #brand in #top voraus (siehe klexel.ts); fehlt die Marke, gibt es keinen Knopf
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
