# Suite aus Klexel und Rigsprite mit Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klexel und Rigsprite laufen als zwei erkennbar getrennte, beim Bauen einzeln abschaltbare Bereiche einer App; ein Workspace hält viele Projekte, und Klexel-Frames sowie Rigsprite-Animationen wandern zwischen den Bereichen.

**Architecture:** Eine schmale, DOM-freie gemeinsame Schicht (`workspace`) hält Projekt-Metadaten, Speicher und Dateiformat. Jeder Bereich wird hinter einer kleinen Schnittstelle `Area` (`mount(root, host)`) eingehängt, die Hülle kennt nur diese Schnittstelle und lädt Bereiche per dynamischem Import. Klexels `main.ts` (heute Modul-Toplevel) wird mechanisch zu `mountKlexel(root, host)`; Rigsprite wird als React-Bereich eingehängt. Austausch läuft über Sprite-Kennungen `{ projectId, frameId }`.

**Tech Stack:** TypeScript, Vite, Vitest (Node, ohne DOM), React 18 + zustand (nur Rigsprite), keine neuen Laufzeit-Abhängigkeiten außer `idb-keyval` (schon in Rigsprite) bzw. direktem IndexedDB in Klexel.

**Spec:** `../specs/2026-10-28-suite-workspace-design.md`

Drei Lieferschritte, je eigener Branch, je für sich ausführbar und auslieferbar: `feature/workspace-projekte` (Tasks 1–7), `feature/suite-rigsprite` (Tasks 8–12), `feature/suite-austausch` (Tasks 13–19). Nach jedem Schritt Merge nach `main` (Projektkonvention: `Merge feature/...`).

## Global Constraints

- **Keine Funktionseinschränkung** von Klexel oder Rigsprite; bestehende Tests beider Programme bleiben grün und werden nicht abgeschwächt (`npm test`, `npm run build`; Rigsprite zusätzlich `npm run typecheck` und `npm run e2e`).
- Alte Stände laden weiter: Klexel `SavedState` (`version` 1–3, IndexedDB `pixelart`/`kv`/`current`), Rigsprite `Project` (`version: 1`, `.rigsprite.json`). Alte Einträge werden nach der Übernahme **nicht gelöscht**, aber nicht erneut übernommen.
- Kein Konto, kein Backend, keine Cloud; mobile first, Touch-Ziele mindestens 44 px (Querformat 40).
- Sprite-Kennung = `{ projectId: string, frameId: number }`; Klexel-`Frame.id` ist stabil.
- Grenzen von Klexel: höchstens 128×128 Pixel (`MAX_SIZE`), 64 Frames (`MAX_FRAMES`).
- Projekt-Arten: `'klexel' | 'rigsprite'`. Importierte Projekte werden **immer als neue Projekte** (neue IDs) hinzugefügt; nichts wird ersetzt oder zusammengeführt.
- Bereichs-Auswahl beim Bauen: Umgebungsvariable `VITE_AREAS` (kommagetrennt, `klexel`, `rigsprite`; Standard beides). Ein abgeschalteter Bereich ist nicht im Bundle und nicht im Service-Worker-Cache.
- Das eigenständige Rigsprite (`D:\source\repos\rigsprite`) wird nicht verändert; Code wird in die Suite übernommen.
- Rückgabe einer zu großen Animation: Warnung, dann Angebot kleinerer Maßstab (Nearest-Neighbor) oder Frame-Bereich; nie stillschweigend beschneiden.
- Die gemeinsame Schicht importiert nichts aus Klexel- oder Rigsprite-Code (Task 1 prüft das per Test).
- Aktualisieren verknüpfter Bilder ändert nur Pixel/Größe; bestehende Zuordnungen zu Knochen bleiben; Auto-Zuordnung nach Namen nur für neu hinzugekommene Bilder.
- Texte der Oberfläche auf Deutsch; Commit-Nachrichten wie im Repo (`feat: …`, deutsch).

## Review Focus

- Schnelles Wechseln während ein Autosave läuft oder eine Auswahl schwebt: nichts geht verloren, kein Projekt überschreibt ein anderes. → Task 5.
- Workspace-Datei mit unbekannter Art, doppelter ID oder kaputtem Projekt: andere Projekte bleiben ladbar, nichts wird still verworfen. → Task 6.
- Projekt löschen, das von einem Rig als Sprite-Quelle verwendet wird: Rig behält das letzte Bild, „Quelle fehlt". → Task 16.
- Frame in Klexel umbenannt, gelöscht, umsortiert: Zuordnung im Rig bleibt, keine doppelten Bilder. → Task 15.
- Build mit nur einem Bereich, Workspace enthält Projekte des anderen: Projekte bleiben erhalten, sind gekennzeichnet. → Tasks 11, 18.

---

## Lieferschritt 1: Workspace und Projektverwaltung (Klexel allein)

Branch: `feature/workspace-projekte`

### Task 1: Gemeinsame Schicht – Modell und Speicher

**Files:**
- Create: `src/workspace/types.ts`, `src/workspace/store.ts`, `src/workspace/memoryBackend.ts`, `src/workspace/idbBackend.ts`
- Test: `src/workspace/store.test.ts`, `src/workspace/isolation.test.ts`

**Interfaces:**
- Produces:
  - `type ProjectKind = 'klexel' | 'rigsprite'`
  - `interface ProjectMeta { id: string; kind: ProjectKind; name: string; updatedAt: number; thumbnail?: string /* PNG-Data-URL */; origin?: { rigProjectId: string; animationId: string } }`
  - `interface KvBackend { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; del(key: string): Promise<void> }`
  - `class WorkspaceStore { constructor(kv: KvBackend); list(): Promise<ProjectMeta[]> /* neueste zuerst */; create(kind, name, payload: unknown): Promise<ProjectMeta>; load(id): Promise<unknown | null>; save(id, payload, patch?: Partial<Pick<ProjectMeta,'name'|'thumbnail'>>): Promise<void>; rename(id, name); duplicate(id): Promise<ProjectMeta>; remove(id): Promise<void>; lastOpened(): Promise<string|null>; setLastOpened(id|null) }`
  - Schlüssel: `ws:index` (Array der Metadaten), `ws:p:<id>` (Payload je Projekt).
  - `newProjectId(): string`

- [ ] **Step 1: Failing tests** in `store.test.ts` mit `MemoryBackend`: `list` liest nur `ws:index` (Backend zählt Zugriffe auf `ws:p:*` = 0); `create`+`load` Round-Trip; `save` aktualisiert `updatedAt` und sortiert nach vorn; `duplicate` erzeugt neue ID, gleichen Payload, Namen `"<Name> (Kopie)"`; `remove` löscht Index-Eintrag und Payload; parallele `save`-Aufrufe zweier Projekte verlieren keinen Index-Eintrag (Index-Schreibzugriffe seriell einreihen). `isolation.test.ts`: liest alle Dateien unter `src/workspace/` und prüft, dass kein Import auf `../model`, `../storage`, `../ui`, `rigsprite` zeigt.
- [ ] **Step 2: Run** `npx vitest run src/workspace` – Expected: FAIL (Module fehlen).
- [ ] **Step 3: Implement** die Signaturen oben; Index-Updates über eine Promise-Kette serialisieren. `idbBackend.ts`: IndexedDB `klexel-workspace`/`kv`, Verbindung wiederverwenden wie `src/storage/storage.ts`.
- [ ] **Step 4: Run** `npx vitest run src/workspace` – Expected: PASS.
- [ ] **Step 5: Commit** `feat: Workspace-Modell und Projektspeicher`.

### Task 2: Klexel-Projekt-Codec und Vorschau

**Files:**
- Create: `src/storage/projectCodec.ts`, `src/storage/thumbnail.ts`
- Test: `src/storage/projectCodec.test.ts`, `src/storage/thumbnail.test.ts`

**Interfaces:**
- Consumes: `serializeState`, `parseState` (`src/storage/state.ts`).
- Produces: `encodeKlexel(doc, palette, color): SavedState`; `decodeKlexel(raw: unknown): { doc; palette; color } | null`; `thumbnailPixels(pixels: Uint32Array, w, h, max = 48): { w; h; rgba: Uint8ClampedArray }` (DOM-frei, Nearest-Neighbor); `rgbaToPngDataUrl(w, h, rgba): string` (Canvas, nur Laufzeit).

- [ ] **Step 1: Failing tests:** Round-Trip `encodeKlexel`→`decodeKlexel` erhält Ebenen, Frames, Palette; ein v1- und v2-Fixture aus `state.test.ts` lädt über `decodeKlexel`; `thumbnailPixels` für 128×64 mit `max=48` liefert 48×24, für 8×8 unverändert 8×8.
- [ ] **Step 2: Run** `npx vitest run src/storage` – Expected: FAIL.
- [ ] **Step 3: Implement** dünn über vorhandene Funktionen.
- [ ] **Step 4: Run** – Expected: PASS.
- [ ] **Step 5: Commit** `feat: Klexel-Projekt-Codec und Vorschau`.

### Task 3: Übernahme des Bestands

**Files:**
- Create: `src/workspace/migrateLegacy.ts`
- Test: `src/workspace/migrateLegacy.test.ts`

**Interfaces:**
- Produces: `migrateLegacy(store: WorkspaceStore, kv: KvBackend, readLegacyKlexel: () => Promise<unknown | null>): Promise<'migrated' | 'none' | 'done-before'>`; Marker `ws:migrated` im Backend.

- [ ] **Step 1: Failing tests:** vorhandener Alt-Stand → ein Projekt `"Mein Bild"` (kind `klexel`), Rückgabe `'migrated'`, `setLastOpened` auf dieses Projekt; zweiter Aufruf → `'done-before'`, kein zweites Projekt; kein Alt-Stand → `'none'`, **kein** Marker gesetzt (späterer Stand wird übernommen); Alt-Eintrag wird nie gelöscht (Lese-Funktion wird nur gelesen).
- [ ] **Step 2: Run** `npx vitest run src/workspace/migrateLegacy.test.ts` – Expected: FAIL.
- [ ] **Step 3: Implement.** `readLegacyKlexel` in `main.ts`-Nähe liest `kv('readonly', st => st.get('current'))` (neu exportiert aus `src/storage/storage.ts` als `readLegacyState()`).
- [ ] **Step 4: Run** – Expected: PASS.
- [ ] **Step 5: Commit** `feat: Bestand beim ersten Start in den Workspace übernehmen`.

### Task 4: Klexel als einhängbarer Bereich

**Files:**
- Create: `src/klexel.ts` (aus `src/main.ts` verschoben), `src/area.ts`
- Modify: `src/main.ts` (wird Start der Hülle, Task 5), `src/storage/storage.ts`
- Test: `src/area.test.ts` (nur Typ-/Vertragstest), bestehende Tests unverändert

**Interfaces:**
- Produces in `src/area.ts`:
  - `interface AreaHost { onChange(): void /* Projekt wurde verändert, Autosave anstoßen */; requestNewProject(): void; isActive(): boolean }`
  - `interface AreaHandle<P> { open(payload: P): void; snapshot(): P; thumbnail(): string | undefined; flush(): void; setActive(on: boolean): void; destroy(): void }`
  - `interface Area<P> { kind: ProjectKind; title: string; mount(root: HTMLElement, host: AreaHost): AreaHandle<P> }`
- Produces in `src/klexel.ts`: `mountKlexel(root, host): AreaHandle<SavedState>` (Payload = `encodeKlexel`-Ergebnis).

- [ ] **Step 1: Mechanisch umbauen, kein Verhalten ändern.** Den gesamten Toplevel-Code aus `src/main.ts` in `mountKlexel` verlegen; `document.getElementById('app')` wird `root`; `saveState(...)`-Aufrufe (`scheduleSave`, `flushSave`) rufen stattdessen `host.onChange()`; `loadState().then(attach)` entfällt, dafür `open(payload)` = `decodeKlexel` + `attach` + Palette/Farbe setzen. „Neu" (`#new`) bleibt die Größenabfrage, ruft danach `host.requestNewProject()` mit der gewählten Größe. Globale Listener (`keydown`, `visibilitychange`, `pagehide`, `resize`) werden an `handle.destroy()` abgemeldet und prüfen `host.isActive()`. Den Link-Start (`openLinkFromHash`, „In Klexel bearbeiten") so anpassen, dass er ein **neues** Projekt anlegt (`host.requestNewProject` mit dem Bild) statt zu ersetzen; die Rückfrage „Das aktuelle Bild wird ersetzt" entfällt dafür.
- [ ] **Step 2: Run** `npm test` und `npm run build` – Expected: PASS (unverändert).
- [ ] **Step 3: Handprüfung** (`run`-Skill, Browser-Pane): alle Werkzeuge, Ebenen, Frames, Auswahl skalieren, Undo/Redo-Tasten, Foto, Link teilen, PNG-Export funktionieren wie vorher. Abweichungen sind Fehler dieses Tasks.
- [ ] **Step 4: Commit** `refactor: Klexel als einhängbaren Bereich kapseln`.

### Task 5: Hülle mit Projektliste und Wechseln

**Files:**
- Create: `src/shell/shell.ts`, `src/shell/projectList.ts`, `src/shell/autosave.ts`, `src/shell/shell.css`
- Modify: `src/main.ts` (startet Hülle), `index.html`, `src/style.css` (nur falls Selektoren kollidieren)
- Test: `src/shell/autosave.test.ts`

**Interfaces:**
- Consumes: `WorkspaceStore`, `Area`, `AreaHandle`, `migrateLegacy`, `thumbnail`.
- Produces: `createAutosave(opts: { save: () => Promise<void>; delayMs?: number }): { schedule(): void; flush(): Promise<void> }` (debounced, `flush` wartet auf laufenden Schreibvorgang); `switchProject(id: string): Promise<void>` in `shell.ts` (flush → laden → `open`).

- [ ] **Step 1: Failing tests** `autosave.test.ts` (fake timers): `schedule` mehrfach → ein Schreibvorgang nach `delayMs`; `flush` schreibt sofort und wartet auf einen bereits laufenden Schreibvorgang; Fehler beim Schreiben wird gemeldet, nächstes `schedule` versucht erneut.
- [ ] **Step 2: Run** `npx vitest run src/shell` – Expected: FAIL.
- [ ] **Step 3: Implement** `autosave.ts`. `shell.ts`: beim Start `migrateLegacy`, `lastOpened` öffnen (sonst neues leeres 32×32-Projekt „Unbenannt"); Projektliste als Seitenschublade/Dialog über einen Button in der Kopfzeile (neben der Marke, ≥ 44 px) mit Name, Vorschau, Datum, Aktionen Öffnen/Umbenennen/Duplizieren/Löschen (Löschen mit Rückfrage), „Neues Projekt", Suche nach Name. `switchProject`: schwebende Auswahl absetzen (über `handle.flush()`), Autosave `flush`, dann Zielprojekt laden und `open`. Wechsel während laufendem Speichern wird eingereiht (eine Warteschlange), nie parallel. `visibilitychange`/`pagehide` → `flush`.
- [ ] **Step 4: Run** `npm test` und `npm run build` – Expected: PASS.
- [ ] **Step 5: Handprüfung:** Projekt A zeichnen, „Neues Projekt", zeichnen, zu A wechseln: Zeichnung von A vollständig; Seite neu laden: letztes Projekt öffnet; sehr schnelles Hin-und-her-Wechseln verliert nichts.
- [ ] **Step 6: Commit** `feat: Projektliste und schnelles Wechseln`.

### Task 6: Workspace-Datei

**Files:**
- Create: `src/workspace/file.ts`, `src/shell/fileMenu.ts`
- Test: `src/workspace/file.test.ts`

**Interfaces:**
- Produces: `interface WorkspaceFile { format: 'klexel-workspace'; version: 1; projects: Array<{ kind: string; name: string; updatedAt: number; thumbnail?: string; origin?: ProjectMeta['origin']; payload: unknown }> }`; `exportWorkspace(store, ids?: string[]): Promise<Blob>`; `importWorkspace(store, text: string, isKnownKind: (kind: string) => boolean): Promise<{ added: ProjectMeta[]; rejected: Array<{ name: string; reason: string }> }>`.
- Unbekannte Art (z. B. abgeschalteter Bereich): Projekt wird **trotzdem gespeichert** (`kind` wie in der Datei), in der Liste als „nicht verfügbar" geführt, beim Export wieder mitgegeben.

- [ ] **Step 1: Failing tests:** Export→Import in leeren Store ergibt gleiche Namen/Payloads mit neuen IDs; Import in Store mit gleichem Namen fügt hinzu, ersetzt nichts; kaputte JSON-Datei → Fehlermeldung, Store unverändert; eine Datei mit einem kaputten und zwei guten Projekten → zwei hinzugefügt, eines in `rejected`; unbekannte `kind` bleibt erhalten und überlebt Export/Import; höhere `version` → verständliche Meldung („neuere Version").
- [ ] **Step 2: Run** `npx vitest run src/workspace/file.test.ts` – Expected: FAIL.
- [ ] **Step 3: Implement** und in der Hülle verdrahten (Menü „Sichern/Laden": ganzer Workspace, einzelnes Projekt; Speichern über `saveBlob`).
- [ ] **Step 4: Run** `npm test` – Expected: PASS.
- [ ] **Step 5: Commit** `feat: Workspace als Datei sichern und laden`.

### Task 7: Auslieferung Schritt 1

**Files:** `public/sw.js`, `docs/ideen/2026-10-18-roadmap.md`

- [ ] **Step 1:** `CACHE`-Version in `public/sw.js` erhöhen; in der Roadmap unter „Stand" den Workspace/Projekt-Browser als umgesetzt nennen (Verweis auf Spec).
- [ ] **Step 2: Run** `npm test`, `npm run build`; Handprüfung wie Task 5 auch mobil (`resize_window` mobile).
- [ ] **Step 3: Commit** `docs: Roadmap nach Workspace aktualisiert`; Merge `feature/workspace-projekte` nach `main`.

---

## Lieferschritt 2: Rigsprite als zweiter Bereich

Branch: `feature/suite-rigsprite`

### Task 8: Repository-Aufbau und Rigsprite-Übernahme

**Files:**
- Create: `packages/shared/` (aus `src/workspace`), `packages/klexel/` (aus `src/`, `public/`, `index.html`-Teilen), `packages/rigsprite/` (Kopie von `D:\source\repos\rigsprite\src`, `public`, `e2e`, Tests), `apps/suite/` (Hülle, `index.html`, `vite.config.ts`), `packages/rigsprite/UEBERNAHME.md` (Herkunft: Repo, Commit-Hash, Datum)
- Modify: Wurzel-`package.json` (`"workspaces": ["packages/*", "apps/*"]`), `tsconfig.json`

- [ ] **Step 1:** `git mv` für die Klexel-Verschiebungen (Historie bleibt). Rigsprite-Quelle ohne `node_modules`, `test-results` kopieren und den Commit-Hash des Originals in `UEBERNAHME.md` festhalten. Abhängigkeiten von Rigsprite (`react`, `react-dom`, `zustand`, `zundo`, `idb-keyval`, Playwright, Testing Library, jsdom, `@vitejs/plugin-react`) im Paket `packages/rigsprite` führen, nicht im Wurzel-Paket.
- [ ] **Step 2: Run** in jedem Paket `npm test`; Rigsprite zusätzlich `npm run typecheck`. Expected: dieselbe Anzahl bestandener Tests wie vorher (Zahlen vor dem Umbau notieren und vergleichen); `npm run build` der Suite baut Klexel-only wie bisher.
- [ ] **Step 3: Commit** `refactor: Repository in Pakete aufteilen, Rigsprite übernommen`.

### Task 9: Bereiche, Build-Schalter und Auslieferung

**Files:**
- Create: `apps/suite/src/areas.ts`, `apps/suite/vite.config.ts`-Erweiterung, `apps/suite/scripts/verify-bundle.mjs`
- Modify: `scripts/deploy.mjs` (Parameter `--areas klexel,rigsprite`), `public/sw.js`, `public/manifest.webmanifest`
- Test: `apps/suite/src/areas.test.ts`

**Interfaces:**
- Produces: `enabledAreas(env: string | undefined): ProjectKind[]` (Standard beide, unbekannte Namen → Fehler); `loadArea(kind: ProjectKind): Promise<Area<unknown>>` – nutzt `import.meta.env.VITE_AREAS` und **statisch erkennbare** `if`-Zweige mit dynamischem `import()`, damit Vite nicht gewählte Bereiche aus dem Bundle entfernt.

- [ ] **Step 1: Failing tests:** `enabledAreas(undefined)` → beide; `'klexel'` → nur Klexel; `'foo'` → wirft; Leerstring → wirft.
- [ ] **Step 2: Run** – Expected: FAIL.
- [ ] **Step 3: Implement.** `verify-bundle.mjs`: nach dem Build `dist/` nach Marker-Zeichenketten durchsuchen (`RigSprite` bzw. `Klexel-Marker`; jeder Bereich exportiert eine Konstante `AREA_MARKER`), bei `VITE_AREAS=klexel` darf der Rigsprite-Marker nicht vorkommen und umgekehrt. Manifest/Titel/Symbol je Build (nur ein Bereich → dessen Name; beide → „Klexel").
- [ ] **Step 4: Run** `npm test`; `VITE_AREAS=klexel npm run build && node apps/suite/scripts/verify-bundle.mjs klexel`, ebenso `rigsprite` und beide – Expected: Prüfung bestanden, kein Marker des abgeschalteten Bereichs.
- [ ] **Step 5: Commit** `feat: Bereiche beim Bauen einzeln abschaltbar`.

### Task 10: Rigsprite-Adapter

**Files:**
- Create: `packages/rigsprite/src/area.tsx`
- Modify: `packages/rigsprite/src/state/persistence.ts`, `packages/rigsprite/src/ui/App.tsx`, `packages/rigsprite/src/ui/shortcuts.ts`
- Test: `packages/rigsprite/src/area.test.ts`

**Interfaces:**
- Consumes: `Area`, `AreaHost`, `AreaHandle` aus `packages/shared`.
- Produces: `rigspriteArea: Area<Project>`; `mount` rendert `<App/>` per `createRoot(root)`; `open(p)` = `useEditor.getState().loadProject(p)`; `snapshot()` = `store.project`; `thumbnail()` = Standbild des Viewports bzw. `undefined`; `host.onChange()` wird bei jeder Änderung von `state.project` gerufen (statt `startAutosave`). Globale Tastenkürzel nur, wenn `host.isActive()`.

- [ ] **Step 1: Failing tests:** `open` mit `createProject('humanoid')` setzt den Store; `setActive(false)` unterdrückt Tastenkürzel (Shortcut-Handler als reine Funktion testbar machen); Änderung am Projekt ruft `host.onChange` genau einmal je Änderung.
- [ ] **Step 2: Run** `npm test -w packages/rigsprite` – Expected: FAIL.
- [ ] **Step 3: Implement.** Die Rigsprite-eigene Autosave (`AUTOSAVE_KEY`) wird in der Suite **nicht** gestartet (Speichern übernimmt die Hülle); Datei-Laden/-Speichern (`openProjectFile`, `downloadProject`) bleibt als Menüpunkt, „Datei öffnen" legt ein neues Workspace-Projekt an.
- [ ] **Step 4: Run** Tests, `typecheck`, `npm run e2e -w packages/rigsprite` – Expected: PASS wie vor der Übernahme.
- [ ] **Step 5: Commit** `feat: Rigsprite als Bereich`.

### Task 11: Bereichswechsel, getrennte Styles, Projekt-Arten in der Liste

**Files:**
- Modify: `apps/suite/src/shell/*`, `packages/klexel/src/style.css`, `packages/rigsprite/src/ui/app.css`
- Test: `apps/suite/src/shell/kinds.test.ts`

- [ ] **Step 1: Failing tests:** Projekt-Art ohne geladenen Bereich (`kind` nicht in `enabledAreas`) → Listeneintrag mit Kennzeichnung „nicht verfügbar" und deaktiviertem Öffnen, aber Umbenennen/Löschen/Export weiter möglich.
- [ ] **Step 2: Implement.** Hülle zeigt einen Umschalter „Klexel | Rigsprite" nur für gebaute Bereiche; ein Bereich bleibt nach dem ersten Mounten bestehen und wird beim Wechsel nur ausgeblendet (`hidden`) und per `setActive(false)` stumm gestellt – kein Neuaufbau, kein Verlust von Ansicht oder Undo bis zum Projektwechsel. Styles: jede Wurzel bekommt eine Klasse (`.area-klexel`, `.area-rigsprite`); Selektoren in beiden CSS-Dateien auf diese Wurzel einschränken (CSS-Nesting), globale Resets nur in der Hülle. Neues Projekt: Auswahl der Art im Dialog.
- [ ] **Step 3: Handprüfung** (Browser-Pane, Desktop und Mobil): beide Bereiche sehen wie vorher aus (Vorher-/Nachher-Screenshots), kein Stil leckt; `VITE_AREAS=klexel`-Build zeigt keinen Umschalter und kein Rigsprite.
- [ ] **Step 4: Run** alle Tests und Builds – Expected: PASS.
- [ ] **Step 5: Commit** `feat: Bereichswechsel und getrennte Styles`.

### Task 12: Rigsprite-Dateien im Workspace und Auslieferung Schritt 2

- [ ] **Step 1:** In `fileMenu` `.rigsprite.json` erkennen: `parseProject` prüfen und als Projekt der Art `rigsprite` hinzufügen (Umzug des alten Rigsprite). Test: Fixture aus `e2e/fixtures` bzw. `createProject` → hinzugefügt; kaputte Datei → Meldung.
- [ ] **Step 2:** Service-Worker-Cache hochzählen, Roadmap/README-Hinweis, `npm run deploy -- --areas klexel,rigsprite` im Trockenlauf prüfen (nur Build, nicht pushen ohne Nutzerfreigabe).
- [ ] **Step 3: Commit** und Merge `feature/suite-rigsprite` nach `main`.

---

## Lieferschritt 3: Austausch

Branch: `feature/suite-austausch`

### Task 13: Frame-Namen in Klexel

**Files:**
- Modify: `packages/klexel/src/model/Document.ts` (`Frame { id; name?: string }`), `src/storage/state.ts` (`parseFrames` und `serializeState` behalten `name`), `src/ui/framesPanel.ts` (Umbenennen)
- Test: `src/storage/state.test.ts`, `src/model/frames.test.ts`

- [ ] **Step 1: Failing tests:** Frame mit Namen übersteht serialize→parse; Fixture ohne `name` lädt unverändert; Duplizieren eines Frames übernimmt den Namen nicht (Name leer); Name wird auf 24 Zeichen gekürzt (`MAX_NAME`).
- [ ] **Step 2:** Run → FAIL; **Step 3:** implementieren (`SavedState.version` bleibt 3, `name` optional); Umbenennen im Frames-Panel (Antippen auf Namen, Undo nicht nötig – Name ist Metadatum, gehört aber in die History-Befehle, falls Frames dort geführt werden: dem Vorbild der Ebenen-Umbenennung folgen).
- [ ] **Step 4:** Run `npm test` → PASS. **Step 5:** Commit `feat: Frames mit Namen`.

### Task 14: Frame-Zusammenrechnen als gemeinsame Funktion

**Files:**
- Create: `packages/shared/src/composite.ts`, `packages/shared/src/rgbaPng.ts`
- Modify: `packages/klexel/src/model/Document.ts` (`compositeFrame` ruft die gemeinsame Funktion)
- Test: `packages/shared/src/composite.test.ts`

**Interfaces:**
- Produces: `compositeLayers(layers: Array<{ visible: boolean; opacity: number; cel?: Uint32Array }>, length: number): Uint32Array` (identisch zu `blendOver`-Ergebnis in Klexel); `pixelsToDataUrl(w, h, pixels: Uint32Array): string` (Canvas, 0xRRGGBBAA → PNG).

- [ ] **Step 1: Failing tests:** Ergebnis stimmt mit `PixelDocument.compositeFrame` für ein Fixture mit zwei Ebenen, einer Deckkraft 50 und einer ausgeblendeten Ebene bitgleich überein; fehlende Cel = transparent.
- [ ] **Step 2–4:** Run FAIL → `blendOver` samt Test dorthin verschieben, Klexel delegiert → PASS inkl. bestehender `layers.test.ts`.
- [ ] **Step 5:** Commit `refactor: Frame-Zusammenrechnen in die gemeinsame Schicht`.

### Task 15: Sprite-Verknüpfung und Aktualisieren (Kern)

**Files:**
- Modify: `packages/rigsprite/src/core/part.ts` (`ImageAsset.source?: { projectId: string; frameId: number }`), `core/project.ts` (`parseProject` behält gültiges `source`, verwirft ungültiges ohne Fehler)
- Create: `packages/rigsprite/src/core/linkedSprites.ts`
- Test: `core/linkedSprites.test.ts`, `core/project.test.ts`

**Interfaces:**
- Produces:
  - `interface SourceFrame { frameId: number; name: string; width: number; height: number; dataUrl: string }`
  - `interface SourceResult { projectName: string; frames: SourceFrame[] }`
  - `refreshLinkedImages(p: Project, projectId: string, source: SourceResult | null): { project: Project; added: string[]; updated: string[]; missing: string[] }` – für Bilder mit `source.projectId === projectId`: Pixel/Größe/`dataUrl` aktualisieren (Name nur, wenn der Nutzer ihn nicht geändert hat); Frames ohne Bild → neues `ImageAsset` und automatische Zuordnung (`matchBoneByFilename`) **nur dafür**; `source === null` oder fehlender Frame → Bild bleibt, ID in `missing`; `parts`, `animations`, `settings` unverändert.
  - `linkFramesAsImages(p: Project, projectId: string, source: SourceResult): { project: Project; added: string[] }` (Erstverknüpfung, nutzt `addImagesAutoAttach`).

- [ ] **Step 1: Failing tests:** neue Pixel eines Frames aktualisieren Bild, `parts` bleiben referenzidentisch; Umbenennen eines Frames ändert keine Zuordnung und erzeugt kein zweites Bild; gelöschter Frame → in `missing`, Bild bleibt; neuer Frame mit Namen `upperArm_L` wird automatisch an den Knochen gehängt, ein bereits manuell zugeordnetes Teil nicht umgehängt; `source === null` → alles `missing`, Projekt unverändert; Umsortieren der Frames ändert nichts.
- [ ] **Step 2–4:** Run FAIL → implementieren → PASS (`npm test -w packages/rigsprite`).
- [ ] **Step 5:** Commit `feat: Rigsprite-Bilder mit Klexel-Frames verknüpfen und aktualisieren`.

### Task 16: Oberfläche für Quelle wählen und Aktualisieren

**Files:**
- Create: `packages/rigsprite/src/ui/LinkSourceDialog.tsx`
- Modify: `packages/rigsprite/src/ui/SpritesPanel.tsx`, `packages/rigsprite/src/area.tsx` (Host-Dienst `host.sources`)
- Modify: `packages/shared/src/area.ts` – `AreaHost` erhält `sources?: { list(): Promise<ProjectMeta[]> /* nur Art klexel */; read(projectId): Promise<SourceResult | null> }` (Hülle liefert, indem sie Klexel-Payloads dekodiert und mit `compositeLayers`/`pixelsToDataUrl` Frames rendert; ist Klexel nicht gebaut, fehlt `sources` und die Oberfläche blendet die Verknüpfung aus)
- Test: `packages/rigsprite/src/ui/LinkSourceDialog.test.tsx`

- [ ] **Step 1: Failing tests:** Dialog listet Klexel-Projekte aus `host.sources.list()`; Auswahl ruft `linkFramesAsImages`; Bei `open(p)` und beim Aktivieren des Bereichs läuft `refreshLinkedImages` für jede im Projekt vorkommende `source.projectId`; „Quelle fehlt"-Kennzeichen am Bild bei `missing`; ohne `host.sources` kein Menüpunkt.
- [ ] **Step 2–4:** Run FAIL → implementieren → PASS. Aktualisieren ist **ein** Undo-Schritt oder gar keiner (nicht im Verlauf), wie zundo-Konfiguration es erlaubt; Entscheidung im Test festhalten.
- [ ] **Step 5:** Handprüfung: Klexel-Dokument mit Frames `upperArm_L` usw. zeichnen → in Rigsprite verknüpfen → in Klexel Pixel ändern → Bereich wechseln → Bild aktualisiert, Animation unberührt. Projekt in Klexel löschen → „Quelle fehlt", Rig bleibt benutzbar.
- [ ] **Step 6:** Commit `feat: Klexel-Frames in Rigsprite als Sprites verwenden`.

### Task 17: Rückgabe einer Animation – Planung und Warnung

**Files:**
- Create: `packages/rigsprite/src/core/returnPlan.ts`
- Test: `core/returnPlan.test.ts`

**Interfaces:**
- Produces:
  - `interface ReturnOptions { scale: number /* ganzzahliger Teiler ≥1 */; from: number; to: number /* Frame-Bereich inklusiv, 0-basiert */ }`
  - `planReturn(frameWidth: number, frameHeight: number, frameCount: number, opts: ReturnOptions): { ok: true; width; height; frames: number } | { ok: false; reasons: Array<'too-wide' | 'too-many-frames'>; suggestion: ReturnOptions }` (Grenzen 128×128, 64 Frames; `suggestion` = größter passender Teiler und Bereich ab `from`)
  - `downscaleNearest(pixels: Uint32Array, w, h, divisor): Uint32Array`

- [ ] **Step 1: Failing tests:** 100×100×10 Frames → ok; 200×100 → `too-wide`, Vorschlag Teiler 2 (100×50); 70 Frames → `too-many-frames`, Vorschlag Bereich 64 Frames; beides gleichzeitig → beide Gründe; Teiler, der nicht ganzzahlig teilt, rundet Größe auf (`ceil`); `downscaleNearest` nimmt das mittlere Pixel je Block.
- [ ] **Step 2–4:** Run FAIL → implementieren → PASS.
- [ ] **Step 5:** Commit `feat: Rückgabe-Planung mit Grenzen von Klexel`.

### Task 18: Rückgabe als neues Klexel-Dokument

**Files:**
- Create: `packages/rigsprite/src/ui/ReturnToKlexelDialog.tsx`, `packages/shared/src/returnDoc.ts`
- Modify: `ExportDialog.tsx` (Schaltfläche „Nach Klexel"), `apps/suite/src/shell/*` (nimmt Rückgabe an, legt Projekt an, wechselt nur nach Bestätigung)
- Test: `packages/shared/src/returnDoc.test.ts`

**Interfaces:**
- Produces: `buildReturnState(frames: Uint32Array[], width: number, height: number, fps: number): unknown` (Payload im Klexel-`SavedState`-Format mit einer Ebene, ein Frame je Bild, Frame-Namen `"<Animation> <n>"`); `AreaHost.returnToKlexel?(req: { name: string; payload: unknown; origin: { rigProjectId: string; animationId: string } }): Promise<void>`. Fehlt `returnToKlexel` (Klexel nicht gebaut), blendet Rigsprite die Schaltfläche aus.
- Rigsprite rendert die Frames über denselben Pfad wie der Spritesheet-Export (gemeinsamer Pivot, einheitliche Größe) mit den gewählten `ReturnOptions`.

- [ ] **Step 1: Failing tests:** `buildReturnState` mit 3 Frames 8×8 → decodierbar über `decodeKlexel`, `fps` übernommen, 3 Frames, Namen gesetzt; wiederholte Rückgabe ruft `returnToKlexel` erneut → neues Projekt (ID verschieden), altes bleibt (Test an der Hülle mit `WorkspaceStore` im Speicher); zu große Animation: Dialog zeigt Warnung mit Vorschlag und legt ohne Bestätigung nichts an (Komponententest mit Mock).
- [ ] **Step 2–4:** Run FAIL → implementieren → PASS.
- [ ] **Step 5:** Handprüfung: Rig → Animation `walk` zurück nach Klexel → Frames in Klexel nachbearbeiten → erneut zurückgeben → zwei Dokumente.
- [ ] **Step 6:** Commit `feat: Animation als Klexel-Dokument zurückgeben`.

### Task 19: Workspace-Datei mit Verknüpfungen und Abschluss

**Files:**
- Modify: `packages/shared/src/file.ts`, Tests dazu; `docs/ideen/2026-10-18-roadmap.md`, `public/sw.js`

- [ ] **Step 1: Failing tests:** Export→Import eines Workspace mit Klexel-Projekt A und Rigsprite-Projekt B (Bilder mit `source.projectId = A`) in einen leeren Store: neue IDs, B verweist auf das **neue** A (Verknüpfungen werden umgeschrieben); Verknüpfung auf ein nicht enthaltenes Projekt bleibt unverändert und wird beim Öffnen als „Quelle fehlt" geführt.
- [ ] **Step 2–4:** Run FAIL → implementieren → PASS.
- [ ] **Step 5: Gesamtprüfung** (`superpowers:verification-before-completion`): `npm test` in jedem Paket, `npm run build` für drei Varianten (`klexel`, `rigsprite`, beide) mit `verify-bundle.mjs`, `npm run e2e -w packages/rigsprite`, Handprüfung des Ablaufs aus der Spec (Teile-Sheet in Klexel → Rig → Animation → zurück → Nacharbeit) auf Desktop und Mobil.
- [ ] **Step 6:** Service-Worker-Cache hochzählen, Roadmap-Stand ergänzen, Commit `docs: Roadmap und Cache nach Austausch`, Merge nach `main`. Deploy (`npm run deploy`) nur nach ausdrücklicher Freigabe durch den Nutzer.
