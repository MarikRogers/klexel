// Hülle (nur Browser): Workspace öffnen, Bestand übernehmen, Bereiche einhängen, Projekte wechseln und automatisch sichern.
// Alles Bereichs-Spezifische (leere Projekte, Lesbarkeit, Änderungserkennung, Alt-Stand, Einhängen) kommt über die
// Bereichs-Beschreibungen (AreaDescriptor); die Hülle importiert kein Bereichs-Paket.
// Jeder Bereich wird beim ersten Projekt seiner Art in einen eigenen Container eingehängt (Klexel: #app, weitere:
// #area-<art> daneben) und bleibt danach eingehängt; sichtbar und aktiv ist nur der Bereich des offenen Projekts.
import './shell.css';
import type { AreaDescriptor, AreaHandle, AreaHost, KvBackend, NewProjectInit, ProjectMeta } from '@suite/shared';
import { WorkspaceStore, IdbBackend, migrateLegacy, DEFAULT_AUTOSAVE_DELAY_MS } from '@suite/shared';
import { showToast } from '@suite/shared/ui';
import { createAutosave } from './autosave';
import { nextUntitledName, afterRemoveError, isOpenable, NEW_PROJECT_SIZE } from './listModel';
import { createProjectList } from './projectList';
import { createFileActions } from './fileMenu';

export interface Shell {
  /** Wechselt zum Projekt id: offene Bearbeitung absetzen, sichern, dann laden und öffnen. Läuft eingereiht, nie parallel. */
  switchProject(id: string): Promise<void>;
}

const BLANK: NewProjectInit = NEW_PROJECT_SIZE;

export interface ShellOptions {
  /** Speicher des Workspace (Standard: IndexedDB; Tests: MemoryBackend) */
  backend?: KvBackend;
}

/** Ein Bereich dieses Builds: Beschreibung, Container und (nach dem ersten Öffnen) der eingehängte Editor. */
interface Slot {
  d: AreaDescriptor<unknown>;
  el: HTMLElement;
  handle?: AreaHandle<unknown>;
  mounting?: Promise<AreaHandle<unknown>>;
}

/**
 * Startet die Hülle mit den Bereichen dieses Builds (Reihenfolge = Vorrang; der erste ist die Vorgabe für ein
 * leeres Workspace). Projekte von Arten ohne Bereich bleiben erhalten und sind in der Liste „nicht verfügbar".
 * app ist der Container von Klexel (seine Bedienelemente suchen #app/#bottom); weitere Bereiche bekommen Geschwister.
 */
export async function startShell(app: HTMLElement, descriptors: readonly AreaDescriptor<unknown>[], opts: ShellOptions = {}): Promise<Shell> {
  const first = descriptors[0];
  if (!first) throw new Error('Kein Bereich in diesem Build enthalten');
  const kinds = descriptors.map(d => d.kind);
  const byKind = (kind: string) => descriptors.find(d => d.kind === kind);
  const canOpen = (m: ProjectMeta) => isOpenable(m, kinds);

  const slots = new Map<string, Slot>();
  for (const d of descriptors) {
    let el = app;
    if (d.kind !== 'klexel') {
      el = document.createElement('div');
      el.id = `area-${d.kind}`;
      app.after(el);
    }
    el.dataset.area = d.kind;
    el.hidden = true;
    slots.set(d.kind, { d, el });
  }
  const slot = (kind: string) => slots.get(kind)!;
  // Kein Vorab-Laden: welcher Bereich gebraucht wird, steht erst nach dem Lesen des Workspace fest (ein Bereich
  // brächte sonst Chunk und globale Styles mit, auch wenn das offene Projekt einer anderen Art ist)

  const kv = opts.backend ?? new IdbBackend();
  const store = new WorkspaceStore(kv);

  // Alt-Stände nur der Bereiche dieses Builds (ohne Klexel keine Klexel-Übernahme)
  for (const d of descriptors) {
    if (!d.readLegacy) continue;
    try {
      await migrateLegacy(store, kv, () => d.readLegacy!(), { kind: d.kind, name: d.legacyName });
    } catch (err) {
      console.error('Übernahme des alten Stands fehlgeschlagen', err);
    }
  }

  // Erst den Stand lesen, dann nur den passenden Bereich einhängen und öffnen (der Link-Dialog prüft beim Einhängen)
  let currentId: string | null = null;
  let currentKind: string | null = null;
  let storeOk = true;
  let metas: ProjectMeta[] = [];
  let order: ProjectMeta[] = [];
  try {
    const last = await store.lastOpened();
    metas = (await store.list()).filter(canOpen);
    // Zuletzt geöffnetes zuerst (nur dessen Bereich wird eingehängt), sonst das zuletzt geänderte
    order = [...metas.filter(m => m.id === last), ...metas.filter(m => m.id !== last)];
  } catch (err) {
    // Ohne Speicher trotzdem bedienbar bleiben (Änderungen gehen dann beim Schließen verloren)
    storeOk = false;
    console.error('Workspace nicht lesbar', err);
    showToast('Projekte konnten nicht geladen werden', 4000);
  }

  let switching = false;
  // Zuletzt gesicherter (oder geöffneter) Stand des offenen Projekts
  let saved: { id: string; key: string } | null = null;
  // Projekte, für die der Bereich in dieser Sitzung keine Vorschau liefern konnte: beim Öffnen nicht erneut nur
  // für die Vorschau schreiben (das Datum spränge sonst bei jedem Öffnen nach vorn)
  const noThumbnail = new Set<string>();
  let list: ReturnType<typeof createProjectList> | undefined;
  const current = (): Slot | undefined => (currentKind === null ? undefined : slots.get(currentKind));
  const currentHandle = () => current()?.handle;

  const autosave = createAutosave({
    // Je Bereich (AreaDescriptor.autosaveDelayMs): Klexel meldet bereits entprellt (500 ms) → nur kurz bündeln (50 ms),
    // damit das Fenster bis zum Schreiben klein bleibt (beim Neuladen/Schließen bricht der Browser offene
    // IndexedDB-Aufträge ab); Rigsprite meldet jede Änderung → gedrosselt. flush/Wechsel/pagehide sichern sofort.
    delayMs: () => current()?.d.autosaveDelayMs ?? DEFAULT_AUTOSAVE_DELAY_MS,
    save: async () => {
      const id = currentId;
      const s = current();
      if (!id || !s?.handle) return;
      // flush() ruft vorher der Auslöser auf (Klexel meldet onChange erst nach abgeschlossener Bearbeitung)
      const payload = s.handle.snapshot();
      // Beim Absetzen (flush) melden die Bereiche immer eine Änderung; ohne echte Änderung nicht schreiben,
      // sonst springt das Datum schon beim bloßen Öffnen und Wechseln nach vorn
      const key = s.d.changeKey(payload);
      if (saved?.id === id && saved.key === key) return;
      const thumbnail = s.handle.thumbnail();
      await store.save(id, payload, thumbnail ? { thumbnail } : undefined);
      if (thumbnail) noThumbnail.delete(id); else noThumbnail.add(id);
      saved = { id, key };
      list?.refresh();
    },
    onError: err => {
      console.error('Speichern fehlgeschlagen', err);
      showToast('Speichern fehlgeschlagen', 3000);
    },
  });

  function hostFor(kind: string): AreaHost {
    return {
      // Meldungen eines verdeckten Bereichs betreffen nicht das offene Projekt
      onChange: () => { if (currentKind === kind) autosave.schedule(); },
      requestNewProject: (init, content) => { void newProject(kind, init ?? BLANK, content); },
      // Nur der sichtbare Bereich und nicht während eines Wechsels (Klexel ignoriert dann Tastenkürzel und merkt
      // Größenänderungen nur vor; Rigsprite ignoriert Tastenkürzel)
      isActive: () => !switching && currentKind === kind,
      openProjects: () => openList(),
    };
  }

  /** Hängt den Bereich der Art ein (einmalig) und liefert seinen Handle; der Container ist danach sichtbar. */
  function ensureMounted(kind: string): Promise<AreaHandle<unknown>> {
    const s = slot(kind);
    if (s.handle) return Promise.resolve(s.handle);
    s.mounting ??= (async () => {
      const area = await s.d.load();
      // Sichtbar einhängen: Bereiche messen beim Einhängen ihre Fläche
      s.el.hidden = false;
      const h = area.mount(s.el, hostFor(kind));
      s.handle = h;
      if (kind === 'klexel') attachProjectsButton();
      return h;
    })();
    s.mounting.catch(() => { s.mounting = undefined; s.el.hidden = true; });
    return s.mounting;
  }

  /** Zeigt nur den Bereich der Art; die anderen werden verdeckt und inaktiv. */
  function reveal(kind: string): void {
    for (const [k, s] of slots) {
      if (k === kind) continue;
      s.handle?.setActive(false);
      s.el.hidden = true;
      s.el.inert = true;
    }
    const target = slot(kind).el;
    target.hidden = false;
    target.inert = switching; // während eines Wechsels erst an dessen Ende bedienbar
  }

  /**
   * Öffnet einen geprüften Stand im Bereich seiner Art; ohne Vorschau wird beim nächsten Sichern einmal geschrieben
   * (erzeugt sie). Scheitert das Laden des Bereichs, bleibt das bisherige Projekt offen.
   */
  async function show(id: string, kind: string, payload: unknown, hasThumbnail: boolean): Promise<void> {
    const prev = { id: currentId, kind: currentKind };
    // Bis das Projekt offen ist, sichert der Autosave nichts (sonst landete ein fremder Stand unter der alten ID)
    currentId = null;
    currentKind = kind;
    let h: AreaHandle<unknown>;
    try { h = await ensureMounted(kind); } catch (err) {
      currentId = prev.id;
      currentKind = prev.kind;
      showToast(`${slot(kind).d.title} konnte nicht geladen werden`, 4000);
      throw err;
    }
    reveal(kind);
    h.open(payload);
    currentId = id;
    saved = hasThumbnail || noThumbnail.has(id) ? { id, key: slot(kind).d.changeKey(h.snapshot()) } : null;
  }

  /**
   * Erstes Projekt öffnen: das zuletzt geöffnete bzw. nächste lesbare (Unlesbares wird übersprungen); nur dessen
   * Bereich wird geladen. Lässt sich ein Bereich nicht laden (z. B. Chunk offline nicht abrufbar), werden Projekte
   * anderer Arten versucht, zuletzt ein leeres Projekt eines ladbaren Bereichs. Wirft nie: die Hülle bleibt bedienbar.
   */
  async function openAtStart(): Promise<void> {
    const failed = new Set<string>();
    for (const m of order) {
      if (failed.has(m.kind)) continue;
      let payload: unknown;
      try { payload = byKind(m.kind)!.decode(await store.load(m.id)); } catch (err) {
        console.error(`Projekt ${m.id} konnte nicht gelesen werden`, err);
        continue;
      }
      if (payload === null) { console.error(`Projekt ${m.id} ist nicht lesbar und wird übersprungen`); continue; }
      try {
        await show(m.id, m.kind, payload, !!m.thumbnail);
        void store.setLastOpened(m.id).catch(err => console.error(err));
        return;
      } catch (err) {
        console.error(`Bereich ${m.kind} konnte nicht geladen werden`, err);
        failed.add(m.kind);
      }
    }
    // Kein öffenbares Projekt: ein leeres der ersten ladbaren Art (Reihenfolge der Bereiche)
    for (const d of descriptors) {
      if (failed.has(d.kind)) continue;
      try { await ensureMounted(d.kind); } catch (err) {
        console.error(`Bereich ${d.kind} konnte nicht geladen werden`, err);
        failed.add(d.kind);
        continue;
      }
      try {
        if (!storeOk) throw new Error('Workspace nicht lesbar');
        const payload = d.blank(BLANK);
        const meta = await store.create(d.kind, nextUntitledName(metas.map(m => m.name)), payload);
        await show(meta.id, d.kind, payload, false);
        void store.setLastOpened(meta.id).catch(err => console.error(err));
      } catch (err) {
        // Ohne Speicher: den Bereich leer zeigen (Änderungen gehen beim Schließen verloren)
        if (storeOk) console.error('Leeres Projekt konnte nicht angelegt werden', err);
        currentKind = d.kind;
        reveal(d.kind);
      }
      return;
    }
    showToast('Kein Bereich konnte geladen werden', 6000);
  }

  await openAtStart();
  currentHandle()?.setActive(true);

  // Eine Warteschlange für alles, was das offene Projekt austauscht oder löscht
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      switching = true;
      document.body.classList.add('shell-busy');
      // Keine Eingaben in die Bereiche (auch keine Tastatur in Feldern), solange gewechselt wird
      for (const s of slots.values()) s.el.inert = true;
      try { return await fn(); } finally {
        switching = false;
        document.body.classList.remove('shell-busy');
        const cur = current();
        if (cur && !cur.el.hidden) cur.el.inert = false;
        currentHandle()?.setActive(true); // vorgemerkte Größenänderung nachholen
      }
    });
    queue = run.catch(() => undefined);
    return run;
  }

  /** Offene Bearbeitung absetzen und sichern; wirft, wenn das Sichern scheitert (dann nicht wechseln). */
  async function saveCurrent(): Promise<void> {
    currentHandle()?.flush();
    await autosave.flush();
  }

  async function openLoaded(id: string, kind: string, payload: unknown, hasThumbnail?: boolean): Promise<void> {
    if (hasThumbnail === undefined) hasThumbnail = !!(await store.list()).find(m => m.id === id)?.thumbnail;
    await show(id, kind, payload, hasThumbnail);
    await store.setLastOpened(id);
  }

  /** Legt ein Projekt der Art an (mit content, falls lesbar, sonst leer aus init/base) und öffnet es. */
  async function createAndOpen(kind: string, init: NewProjectInit, base?: unknown, content?: unknown): Promise<void> {
    const d = byKind(kind);
    if (!d) throw new Error(`Bereich ${kind} fehlt in diesem Build`);
    const given = content === undefined ? null : d.decode(content);
    const payload = given ?? d.blank(init, base);
    const names = (await store.list()).map(m => m.name);
    const meta = await store.create(d.kind, nextUntitledName(names), payload);
    await openLoaded(meta.id, kind, payload, false);
    autosave.schedule(); // Vorschau erzeugen
  }

  function switchProject(id: string): Promise<void> {
    return enqueue(async () => {
      if (id === currentId) return;
      const meta = (await store.list()).find(m => m.id === id);
      const d = meta && byKind(meta.kind);
      if (!meta || !d) {
        showToast('Projekt ist in dieser Version nicht verfügbar', 3000);
        throw new Error(`Projekt ${id} nicht verfügbar`);
      }
      try { await saveCurrent(); } catch {
        showToast('Speichern fehlgeschlagen – Projekt nicht gewechselt', 3000);
        throw new Error('Wechsel abgebrochen');
      }
      const payload = d.decode(await store.load(id));
      if (payload === null) {
        showToast('Projekt ist nicht lesbar', 3000);
        throw new Error(`Projekt ${id} nicht lesbar`);
      }
      await openLoaded(id, meta.kind, payload, !!meta.thumbnail);
    });
  }

  // Neues Projekt (Klexels „Neu", Link „In Klexel bearbeiten", Rigsprites „Neu"/„Öffnen", Projektliste);
  // das aktuelle bleibt erhalten
  function newProject(kind: string, init: NewProjectInit, content?: unknown): Promise<void> {
    return enqueue(async () => {
      try { await saveCurrent(); } catch {
        showToast('Speichern fehlgeschlagen – kein neues Projekt angelegt', 3000);
        throw new Error('Neues Projekt abgebrochen');
      }
      // Vorlage (bei Klexel Palette und Farbe) nur aus einem Projekt derselben Art
      const base = kind === currentKind ? currentHandle()?.snapshot() : undefined;
      await createAndOpen(kind, init, base, content);
    }).catch(err => console.error(err));
  }

  function removeProject(id: string): Promise<void> {
    return enqueue(async () => {
      if (id !== currentId) { await store.remove(id); return; }
      // Das offene Projekt: nichts mehr dafür speichern, dann ein anderes öffnen oder ein leeres anlegen
      const base = { kind: currentKind ?? first.kind, payload: currentHandle()?.snapshot() };
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
          currentKind = base.kind;
          autosave.schedule();
          showToast('Löschen fehlgeschlagen – das Projekt bleibt erhalten', 3000);
        } else {
          showToast('Fehler nach dem Löschen – ein anderes Projekt wird geöffnet', 3000);
          try { await openFallback(base); } catch (err2) {
            // Letzter Ausweg: geöffnet lassen; Sichern auf die gelöschte ID ist ein No-op
            console.error(err2);
            currentId = id;
            currentKind = base.kind;
            showToast('Kein anderes Projekt konnte geöffnet werden', 4000);
          }
        }
        throw err;
      }
    });
  }

  /** Nächstes lesbares Projekt (einer Art dieses Builds) öffnen, sonst ein leeres der bisherigen Art anlegen. */
  async function openFallback(base: { kind: string; payload: unknown }): Promise<void> {
    for (const m of (await store.list()).filter(canOpen)) {
      const payload = byKind(m.kind)!.decode(await store.load(m.id));
      if (payload !== null) { await openLoaded(m.id, m.kind, payload, !!m.thumbnail); return; }
    }
    await createAndOpen(base.kind, BLANK, base.payload);
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
    currentKind: () => currentKind,
    canOpen,
    open: switchProject,
    rename: (id, name) => store.rename(id, name),
    duplicate: duplicateProject,
    remove: removeProject,
    create: (kind, width, height) => newProject(kind, { width, height }),
    kinds: descriptors.map(d => ({ kind: d.kind, title: d.title, sized: !!d.newProjectSize })),
    exportAll: files.exportAll,
    exportOne: m => files.exportOne(m.id, m.name),
    importFile: async f => { await files.importFile(f); },
  });

  /** Projektliste zeigen (Knopf in Klexels Kopfleiste, Rigsprites „Projekte" über host.openProjects) */
  function openList(): void {
    currentHandle()?.flush();
    list?.open();
  }

  // Knopf „Projekte" neben der Marke in Klexels Kopfleiste; erst nach dem Einhängen von Klexel vorhanden
  function attachProjectsButton(): void {
    if (document.getElementById('projectsBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'projectsBtn';
    btn.type = 'button';
    btn.title = 'Projekte';
    btn.setAttribute('aria-label', 'Projekte');
    btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M2 5h7l2 2h9v11H2z"/></svg>`;
    btn.onclick = () => openList();
    // Kopplung an Klexels Kopfleiste: setzt #brand in #top voraus (siehe klexel.ts); fehlt die Marke, gibt es keinen Knopf
    document.getElementById('brand')?.after(btn);
  }

  // Beim Verstecken/Schließen sofort sichern (Klexels eigener Listener meldet vorher onChange)
  const flushNow = () => {
    if (switching) return; // ein Wechsel sichert selbst
    currentHandle()?.flush();
    autosave.flush().catch(() => undefined);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
  window.addEventListener('pagehide', flushNow);

  return { switchProject };
}
