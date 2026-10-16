# Animation / Spritesheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Pixelart-PWA bekommt Frames (gemeinsame Ebenenliste, Pixel pro Ebene und Frame), Onion Skin, Vorschau-Loop und den Export als Spritesheet-PNG und ZIP mit Einzelbildern, vollständig per Undo steuerbar.

**Architecture:** `Layer.data` wird zu `Layer.cels: Map<frameId, Uint32Array>`; `PixelDocument` kennt `frames`, `currentFrameId` und rechnet pro Frame (`compositeFrame`, Cache pro Frame). `doc.get/set/data` und alle Werkzeuge meinen weiter „aktive Ebene im aktuellen Frame“. `History` bekommt Frame-Schritte, Speichern wird Format v3 mit Migration. Ein Frames-Fenster (wie das Ebenen-Fenster) liefert Streifen, Aktionen, Abspielen, Onion Skin und Export; der Export liegt in reinen, getesteten Modulen unter `src/export/`.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest (Testumgebung `node`, kein DOM), Canvas 2D, IndexedDB.

**Spec:** `docs/specs/2026-10-16-animation-design.md` (baut auf `docs/specs/2026-10-16-ebenen-design.md` auf)

## Global Constraints

- `MAX_FRAMES = 64`; `MAX_PIXELS = 16_000_000`; Speicherbudget `width * height * layers.length * frames.length <= MAX_PIXELS` bei jedem Hinzufügen/Duplizieren von Ebene oder Frame; mindestens 1 Frame, `MAX_LAYERS = 16` bleibt.
- Frame-IDs ab 1, werden nie wiederverwendet (`nextFrameId` wird nie zurückgesetzt); ein fehlender Eintrag in `cels` bedeutet „komplett transparent“; `get` legt keine Cel an, `set`/`data` legen sie bei Bedarf an.
- `fps` ganzzahlig 1..30 (Standard 8), `onion` Boolean (Standard `false`); beides Dokument-Einstellungen, kein History-Schritt; `setCurrentFrame` ist kein Schritt.
- Neuer Frame direkt nach dem aktuellen und wird aktuell; Löschen: danach vorheriger Frame aktuell, sonst der erste; letzter Frame nicht löschbar; Undo/Redo eines `pixels`-Schritts springt zum Frame des Schritts.
- Onion Skin: vorheriger Frame rot `255,80,80`, nächster blau `80,140,255`, je 30 % Deckkraft, hinter dem aktuellen Frame, kein Umlauf, nur Anzeige (nicht im Export).
- Export: Skalierung 1×/2×/4×/8× (Standard 1×) ganzzahlig ohne Glättung; Layout `row` | `column` | `grid` (Spalten `clamp(columns, 1, count)`, Standard `ceil(sqrt(n))`); Dateinamen `spritesheet.png`, `frames.zip`, `frame-001.png` …; ZIP ohne Kompression (stored) mit CRC-32.
- Gespeichertes Format `version: 3`; `cels` als `Record<string, Uint32Array>` (Schlüssel = Frame-ID als Text); v2 und Stände ohne `version` werden zu einem Frame migriert.
- Frames-Fenster: Hochformat Sheet von unten (höchstens 60 % der Höhe), Querformat 280 px rechts, Touch-Ziele ≥ 40 px, Safe Areas, SVG-Icons `stroke-width="1.25"`, Vorschau 24×24, UI-Texte deutsch; Ebenen- und Frames-Fenster nie gleichzeitig offen.
- Bestehende 52 Tests bleiben grün (Anpassungen an die neue API sind erlaubt); nach jedem Task laufen `npx tsc --noEmit` und `npx vitest run` ohne Fehler.

## Review Focus

- Frame löschen und Undo: alle Cels **aller** Ebenen kehren zurück; Ebenen ohne Cel in diesem Frame bleiben ohne Cel (Task 2).
- Ebene löschen, duplizieren und zusammenführen bei mehreren Frames wirkt in allen Frames, samt Undo/Redo (Task 2).
- Beschädigte v3-Stände (Cel für unbekannten Frame, falsche Länge, Budget überschritten, `fps` 0 oder 31) ergeben ein leeres Dokument; v2-Stand lädt zu einem Frame (Task 3).
- Abspielen, während die Frame-Liste sich ändert (letzten Frame löschen, auf einen Frame reduzieren): kein Fehler, Vorschau stoppt sauber; Schließen des Fensters stoppt die Vorschau (Task 6).
- Budget-/Limit-Ablehnung (65. Frame, Ebene bei Budgetgrenze) erzeugt weder Schritt noch Fehler; Wechsel von Frame, Undo oder Fenster mitten im Strich verwirft den Strich und lässt keine veralteten Thumbnails zurück (Tasks 1, 2, 5).

---

### Task 1: Frame-Datenmodell (Cels) und Compositing

**Files:**
- Modify: `src/model/Document.ts`, `src/model/History.ts` (nur mechanisch, Ein-Frame-Verhalten), `src/storage/state.ts` (v2-Format bleibt, nutzt Cels des aktuellen Frames), `src/ui/layersPanel.ts` (Vorschau liest `doc.cel`), betroffene bestehende Tests (`src/model/layers.test.ts`, `history.test.ts`, `src/storage/state.test.ts`, `src/tools/tools.test.ts`)
- Create: `src/model/frames.test.ts`

**Interfaces:**
- Produces in `Document.ts`:
  - `MAX_FRAMES = 64`, `MAX_PIXELS = 16_000_000`; `interface Frame { id: number }`; `Layer` = `LayerProps & { id: number; cels: Map<number, Uint32Array> }` (kein `data` mehr).
  - `PixelDocument`: Felder `frames: Frame[]`, `currentFrameId: number`, `nextFrameId: number`, `fps: number` (8), `onion: boolean` (false); `constructor(width, height)` (ein Frame id 1, Ebene "Ebene 1"); `static restore(state: { width: number; height: number; frames: Frame[]; currentFrameId: number; nextFrameId: number; layers: Layer[]; activeId: number; nextId: number; fps?: number; onion?: boolean }): PixelDocument` ersetzt `fromLayers` (wirft `RangeError` bei 0 oder >64 Frames, doppelten oder ungültigen IDs, Cel zu unbekanntem Frame oder falscher Länge, unbekanntem `currentFrameId`/`activeId`, Budgetüberschreitung, sowie alle bisherigen Ebenen-Prüfungen).
  - `cel(layerId: number, frameId: number): Uint32Array | undefined`, `ensureCel(layerId: number, frameId: number): Uint32Array`; Getter `data` = `ensureCel(activeId, currentFrameId)`; `get(x, y)` liest die aktive Ebene im aktuellen Frame ohne Cel anzulegen; `set` legt bei Bedarf an.
  - `frameIndex(id: number): number` (−1 unbekannt), `createFrame(): Frame` (vergibt `nextFrameId++`), `insertFrame(frame: Frame, index: number): void` (wirft bei `MAX_FRAMES`/Budget), `removeFrame(id: number): { frame: Frame; index: number; cels: Map<number, Uint32Array | undefined> }` (wirft beim letzten Frame; entfernt die Cels aus allen Ebenen, ändert `currentFrameId` nicht), `moveFrame(id: number, toIndex: number): void`, `setCurrentFrame(id: number): void`, `restoreFrameCels(frameId: number, cels: Map<number, Uint32Array | undefined>): void` (`undefined` löscht die Cel), `fitsBudget(extraLayers = 0, extraFrames = 0): boolean`.
  - `compositeFrame(frameId: number): Uint32Array` (Cache pro Frame, gleiche Regeln wie bisher), `composite()` = `compositeFrame(currentFrameId)`; `touch(frameId?: number)` verwirft nur den Cache dieses Frames, ohne Argument alle; `getComposite` bezieht sich auf den aktuellen Frame; `set` und Pixel-Schreiben der History rufen `touch(frameId)`.
  - `layerActions(doc)`: `canAdd`/`canDuplicate` zusätzlich über `fitsBudget`; neu `frameActions(doc): { canAdd: boolean; canDuplicate: boolean; canRemove: boolean; canMoveLeft: boolean; canMoveRight: boolean }` (Add/Duplicate: `frames.length < MAX_FRAMES && fitsBudget(0, 1)`; Remove: mehr als ein Frame; Move: nicht am Rand).

- [ ] **Step 1: Failing tests in `src/model/frames.test.ts`:**
  - `neues Dokument: ein Frame id 1, currentFrameId 1, nextFrameId 2, fps 8, onion false`.
  - `get legt keine Cel an, set legt sie an`: `doc.cel(1, 1)` ist erst nach `set(1, 1, 5)` definiert; `get(0, 0)` ohne Cel gibt `0`.
  - `Frame-IDs werden nie wiederverwendet`: Frame anlegen, einfügen, entfernen, `createFrame().id === 3`.
  - `Grenzen`: `removeFrame` beim letzten Frame wirft; 65. `insertFrame` wirft; `moveFrame` klemmt den Index.
  - `removeFrame` liefert die Cels je Ebene und nimmt sie aus allen Ebenen; `restoreFrameCels` stellt sie wieder her (`undefined` bleibt ohne Cel).
  - `compositeFrame`: zwei Frames mit unterschiedlichen Pixeln auf derselben Ebene liefern je ihr Bild; Cache pro Frame: nach `set` im aktuellen Frame ändert sich `compositeFrame(current)`, während `compositeFrame(other)` dasselbe Array-Objekt bleibt (`touch(frameId)` verwirft nur diesen); `touch()` ohne Argument verwirft alle; fehlende Cels sind transparent.
  - `Budget`: bei `new PixelDocument(128, 128)` mit 16 Ebenen und 61 Frames `fitsBudget(0, 1)` ist `false` (16·61·16384 = 15 990 784; mit 62 Frames > 16 000 000 → false); `frameActions.canAdd` false, wenn das Budget erreicht ist; bei kleinem Dokument true.
  - `restore`: gültiger Zustand ergibt gleiche Frames/Ebenen/Cels; wirft bei Cel für unbekannten Frame, Cel-Länge ≠ `w*h`, 0 und 65 Frames, doppelten Frame-IDs, unbekanntem `currentFrameId`, Budgetüberschreitung.
  - `frameActions` bei einem Frame: `canRemove`, `canMoveLeft`, `canMoveRight` false; bei drei Frames und mittlerem aktuellen Frame beide Move-Flags true.
- [ ] **Step 2: Run** `npx vitest run src/model/frames.test.ts` → FAIL.
- [ ] **Step 3: Implement** die Signaturen oben in `Document.ts`; stelle alle bisherigen Zugriffe auf `layer.data` in `History.ts` (Schreiben über `ensureCel(layerId, currentFrameId)`; Duplizieren und Zusammenführen mechanisch für den aktuellen Frame — die vollständige Mehr-Frame-Semantik kommt in Task 2), `state.ts` (v2-Format unverändert gespeichert: pro Ebene die Cel des aktuellen Frames bzw. ein leeres Feld; Laden über `restore` mit einem Frame) und `layersPanel.ts` (Vorschau liest `doc.cel(layer.id, doc.currentFrameId)`, fehlende Cel = leer) auf die neue API um; Tests entsprechend anpassen (`fromLayers` → `restore`, `layer.data` → `doc.ensureCel`/`doc.cel`).
- [ ] **Step 4: Run** `npx tsc --noEmit` und `npx vitest run` → alle Tests (bestehende angepasste + neue) grün.
- [ ] **Step 5: Commit** "Frame-Datenmodell: Cels pro Ebene und Frame".

---

### Task 2: Frame-Schritte und Mehr-Frame-Semantik in der History

**Files:**
- Modify: `src/model/History.ts`
- Create/extend: `src/model/frameHistory.test.ts`

**Interfaces:**
- Consumes: Task 1 (`createFrame/insertFrame/removeFrame/moveFrame/setCurrentFrame/restoreFrameCels/frameActions/fitsBudget/cel/ensureCel`).
- Produces in `History` zusätzlich: `addFrame(): Frame | null`, `duplicateFrame(): Frame | null`, `removeFrame(): boolean`, `moveFrame(delta: 1 | -1): boolean` (Verhalten laut Global Constraints; `null`/`false` an Grenzen oder Budget ohne Schritt, ohne Fehler). `pixels`-Schritte tragen `frameId` (von `begin()` gemerkt, `set` schreibt in diese Cel und ruft `touch(frameId)`); Undo/Redo eines `pixels`-Schritts ruft `doc.setCurrentFrame(step.frameId)`. `duplicateLayer` kopiert die Cels **aller** Frames; `mergeDown` verschmilzt in jedem Frame die obere Cel (`blendOver` mit der Deckkraft der oberen Ebene) in die untere und hält deren vorherige Cels aller Frames für Undo; `remove`/`merge`-Schritte speichern die Ebene samt aller Cels. Neue Schrittarten `addFrame`, `duplicateFrame`, `removeFrame` (alle Cels je Ebene, vorheriger und folgender `currentFrameId`), `moveFrame`; alle Teil des gemeinsamen Stacks (Limit 100).

- [ ] **Step 1: Failing tests** (Namen und Kernaussagen):
  - `addFrame`: neuer leerer Frame direkt nach dem aktuellen und aktuell; Undo entfernt ihn und stellt `currentFrameId` wieder her, Redo fügt denselben Frame (gleiche `id`) wieder ein.
  - `duplicateFrame`: Pixel aller Ebenen kopiert (zwei Ebenen mit unterschiedlichen Pixeln; Änderung im Duplikat verändert das Original nicht); Undo/Redo.
  - `removeFrame`: Frame mit Pixeln auf Ebene A (Ebene B ohne Cel in diesem Frame) löschen; Undo bringt den Frame mit **gleicher id** zurück, A-Pixel sind wieder da, B hat weiterhin keine Cel (`cel(B, frameId) === undefined`); danach neu angelegter Frame bekommt eine neue ID; Löschen des letzten Frames → `false`, kein Schritt; nach dem Löschen ist der vorherige Frame aktuell, beim ersten Frame der neue erste.
  - `moveFrame`: Undo/Redo stellen die Reihenfolge her; am Rand `false` ohne Schritt.
  - `pixels` über mehrere Frames: Strich in Frame 1, Frame wechseln, Strich in Frame 2; Undo ändert nur Frame 2 **und** springt zu Frame 2, zweites Undo ändert Frame 1 und springt zu Frame 1.
  - `Layer löschen mit zwei Frames`: Undo bringt die Ebene mit den Cels beider Frames zurück; `duplicateLayer` kopiert beide Cels (Kopie unabhängig); `mergeDown` verschmilzt in beiden Frames (Frame 1 hat Pixel nur auf der oberen Ebene, Frame 2 nur auf der unteren), Undo stellt beide Frames der unteren Ebene wieder her, Redo wiederholt.
  - `Grenzen`: 65. `addFrame()` und `duplicateFrame()` → `null`, `canUndo` unverändert; bei erreichtem Budget `addFrame()` → `null`; Limit 100 gilt gemeinsam für alle Schrittarten (101 gemischte Schritte → ältester entfällt).
  - `Undo während eines laufenden Strichs` wird in der UI verworfen (Task 5); hier: `cancel()` stellt die Pixel des `begin()`-Frames wieder her, auch wenn zwischenzeitlich `setCurrentFrame` aufgerufen wurde.
- [ ] **Step 2: Run** `npx vitest run src/model/frameHistory.test.ts` → FAIL.
- [ ] **Step 3: Implement** die Signaturen oben; nutze `doc.removeFrame`/`restoreFrameCels` für die Cels, halte beim Frame-Löschen die Cels je Ebene (`Map<layerId, Uint32Array | undefined>`).
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 5: Commit** "History: Frame-Schritte, Ebenen über alle Frames".

---

### Task 3: Speichern v3 und Migration

**Files:**
- Modify: `src/storage/state.ts`, `src/storage/storage.ts` (nur falls nötig), `src/storage/state.test.ts`, `src/main.ts` (Laden übernimmt `fps`, `onion`)

**Interfaces:**
- Consumes: Task 1 (`PixelDocument.restore`, `MAX_FRAMES`, `MAX_PIXELS`, `fps`, `onion`).
- Produces: `interface SavedState { version: 3; width; height; frames: Frame[]; currentFrameId; nextFrameId; layers: Array<LayerProps & { id: number; cels: Record<string, Uint32Array> }>; activeId; nextId; fps; onion; palette: number[]; color: number }`; `serializeState(doc, palette, color): SavedState` (kopiert die Cels, nur vorhandene); `parseState(raw: unknown): { doc: PixelDocument; palette: number[]; color: number } | null` akzeptiert v3, v2 (Ebenen mit `data`) und das alte Format ohne `version` und migriert die beiden letzteren zu einem Frame (id 1, `currentFrameId` 1, `nextFrameId` 2, `fps` 8, `onion` false, `cels: { "1": data }`); `null` bei jedem Formfehler (Frame-Zahl 0 oder > 64, doppelte/ungültige Frame-IDs, Cel-Schlüssel nicht zu einem Frame gehörend oder keine ganze Zahl, falsche Cel-Länge oder -Typ, `currentFrameId` unbekannt, `fps` nicht ganzzahlig 1..30, `onion` kein Boolean, Budget überschritten, plus alle bisherigen Prüfungen); `nextFrameId` wird auf `max(id)+1` angehoben, falls zu klein.

- [ ] **Step 1: Failing tests** in `state.test.ts` (bestehende anpassen): `Roundtrip v3` (zwei Frames, drei Ebenen, Cel nur teilweise vorhanden, `fps` 12, `onion` true, `currentFrameId` des zweiten Frames → identisch nach `parseState(serializeState(…))`, fehlende Cels bleiben fehlend); `Migration v2` (Stand mit `version: 2` und Ebenen mit `data` → ein Frame, Pixel in `cel(layerId, 1)`); `Migration alt` (Stand ohne `version`); `Beschädigte v3-Stände → null`: Cel für unbekannten Frame, Cel-Länge falsch, 0 und 65 Frames, doppelte Frame-ID, `currentFrameId` unbekannt, `fps` 0 und 31 und 1.5, `onion: 1`, Budget überschritten (z. B. 128×128, 16 Ebenen, 62 Frames); `nextFrameId` zu klein → korrigiert.
- [ ] **Step 2: Run** `npx vitest run src/storage/state.test.ts` → FAIL.
- [ ] **Step 3: Implement** `serializeState`/`parseState` wie oben; in `main.ts` bleibt `loadState().then(s => … attach(s.doc))` (das Dokument trägt `fps`/`onion` selbst).
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 5: Commit** "Speichern v3 mit Frames; Migration von v2".

---

### Task 4: Export-Module (Spritesheet, ZIP)

**Files:**
- Create: `src/export/sheet.ts`, `src/export/zip.ts`, `src/export/saveBlob.ts`, `src/export/export.test.ts`
- Modify: `src/main.ts` (Export-Button nutzt `saveBlob`)

**Interfaces:**
- Consumes: Task 1 (`doc.compositeFrame`, `doc.frames`).
- Produces:
  - `sheet.ts`: `type SheetMode = 'row' | 'column' | 'grid'`; `sheetLayout(count: number, frameW: number, frameH: number, mode: SheetMode, columns?: number): { cols: number; rows: number; width: number; height: number; positions: Array<{ x: number; y: number }> }` (rein; `row`: `cols = count, rows = 1`; `column`: `cols = 1, rows = count`; `grid`: `cols = clamp(columns ?? ceil(sqrt(count)), 1, count)`, `rows = ceil(count / cols)`; Positionen zeilenweise von links oben, in Pixeln bei Skalierung 1×); `renderSheet(doc: PixelDocument, mode: SheetMode, columns: number | undefined, scale: number): Promise<Blob>`; `frameFiles(doc: PixelDocument, scale: number): Promise<Array<{ name: string; data: Uint8Array }>>` (`frame-001.png` …, dreistellig).
  - `zip.ts`: `crc32(data: Uint8Array): number` (unsigned); `buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array` (stored, Local File Header `0x04034b50`, Central Directory `0x02014b50`, End-Record `0x06054b50`, UTF-8-Namen, kein Zip64).
  - `saveBlob.ts`: `saveBlob(blob: Blob, filename: string, mimeType: string): Promise<void>` (Web Share mit Datei, wenn `navigator.canShare?.({ files })`; sonst Download über `<a download>` und `URL.revokeObjectURL` nach 1000 ms) — herausgezogen aus dem bisherigen Export-Handler in `main.ts`, Verhalten dort unverändert.

- [ ] **Step 1: Failing tests** in `export.test.ts`: `sheetLayout row/column` (drei Frames 16×8 → 48×8 bzw. 16×24, Positionen `[(0,0),(16,0),(32,0)]` bzw. `[(0,0),(0,8),(0,16)]`); `grid` (fünf Frames 8×8 mit `columns` 2 → `cols 2, rows 3`, 16×24, Positionen zeilenweise; `columns` 9 wird auf 5 geklemmt; `columns` 0 auf 1; ohne `columns` → `ceil(sqrt(5)) = 3`); `crc32`: `"123456789"` → `0xCBF43926`, leere Eingabe → `0`; `buildZip` mit zwei Dateien (`a.txt` = "hi", `b.bin` = 3 Bytes): Länge stimmt mit der Summe der Header-/Datenlängen überein, Signatur `0x04034b50` am Anfang, End-Record mit Eintragszahl 2 und korrektem Offset des Central Directory, jede Datei unverändert an ihrem Offset, CRC-Felder entsprechen `crc32`.
- [ ] **Step 2: Run** `npx vitest run src/export/export.test.ts` → FAIL.
- [ ] **Step 3: Implement** die Module wie oben; `renderSheet`/`frameFiles` nutzen `compositeFrame` und ein Offscreen-Canvas (DOM, nicht unit-getestet; Prüfung im Browser); `main.ts`: Export-Button ruft `saveBlob(await exportPng(doc, scale), 'pixelart.png', 'image/png')`.
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 5: Commit** "Export: Spritesheet-Layout, ZIP-Schreiber, saveBlob".

---

### Task 5: Frames-Fenster (Streifen und Aktionen)

**Files:**
- Create: `src/ui/framesPanel.ts`, `src/ui/thumb.ts`
- Modify: `src/ui/icons.ts` (neu: `frames`, `addFrame`, `duplicateFrame`, `left`, `right`, `play`, `stop`, `onion`), `src/ui/layersPanel.ts` (nutzt `drawThumb`), `src/main.ts`, `src/style.css`

**Interfaces:**
- Consumes: Task 1 (`frameActions`, `compositeFrame`, `setCurrentFrame`), Task 2 (`History.addFrame/duplicateFrame/removeFrame/moveFrame`), `showToast`.
- Produces: `thumb.ts`: `drawThumb(canvas: HTMLCanvasElement, pixels: Uint32Array | undefined, w: number, h: number): void` (24×24, nearest-neighbor, Seitenverhältnis erhalten, Schachbrett dahinter, `undefined` = leer) — der bisherige Zeichencode aus `layersPanel.ts` wandert hierher und wird von beiden Fenstern genutzt. `createFramesPanel(deps: { getDoc(): PixelDocument; getHistory(): History; onChange(): void; discardStroke(): void }): { toggle(): void; close(): void; refresh(): void; invalidate(): void; readonly isOpen: boolean }` (`invalidate()` erzwingt das Neuzeichnen aller Thumbnails).

- [ ] **Step 1: Fenster-Markup** (`#frames` in `#app`, anfangs `hidden`): Kopf mit Titel und Schließen-Button; waagerecht scrollbarer Frame-Streifen; Aktionsleiste (Hinzufügen, Duplizieren, Löschen, Nach links, Nach rechts); Bereich für Abspielen/Onion/Export wird in Task 6 gefüllt (Container vorhanden, leer).
- [ ] **Step 2: Streifen:** pro Frame ein Tile mit `drawThumb(compositeFrame(id))` und Nummer (ab 1), aktuelle hervorgehoben; Antippen → `discardStroke()`, `doc.setCurrentFrame(id)`, `onChange()`. Neu zeichnen: alle Thumbnails bei Änderung der Frame-Signatur (IDs in Reihenfolge), bei `invalidate()` und beim Öffnen; beim Zeichnen nur das Tile des aktuellen Frames, höchstens einmal pro Animationsframe (`requestAnimationFrame`, Callback prüft `isOpen` und liest das Dokument über `getDoc()` beim Auslösen).
- [ ] **Step 3: Aktionen** über `run()` wie im Ebenen-Fenster (`discardStroke()`, History-Methode, `onChange()`); Buttons per `frameActions(doc)` aktivieren; ist `frames.length >= MAX_FRAMES` oder das Budget erreicht, zeigt ein Antippen von Hinzufügen/Duplizieren `showToast('Frame-Limit erreicht')` bzw. `showToast('Speicherlimit erreicht')` (deaktivierte Buttons bleiben antippbar, `aria-disabled`, kein Schritt).
- [ ] **Step 4: `main.ts`:** Button **Frames** (`ICON.frames`, `title="Frames"`, `id="framesBtn"`) in `#top`; `createFramesPanel({ … discardStroke: () => { endStroke(false); cancelShape(); } })`; Öffnen eines Fensters schließt das andere (`framesBtn`: `layersPanel.close()` dann `framesPanel.toggle()`; `layersBtn`: `framesPanel.close()` dann `layersPanel.toggle()`; jeweils `refresh()`); `refresh()` ruft `framesPanel.refresh()`; Undo/Redo und `attach()` rufen `framesPanel.invalidate()`, Undo/Redo beenden einen laufenden Strich wie bisher, `attach()` schließt beide Fenster.
- [ ] **Step 5: CSS** wie das Ebenen-Fenster (Hochformat Sheet ≤ 60 % Höhe unten, Querformat 280 px rechts mit `env(safe-area-inset-right)`, Aktionsleiste `flex:1 1 0; min-width:40px`, Tiles ≥ 40 px).
- [ ] **Step 6: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 7: Verifikation im Browser** (Mobil-Viewport Hoch- und Querformat, Dev-Server nur den eigenen stoppen, nie alle `node.exe`): Fenster öffnen/schließen und exklusiv zum Ebenen-Fenster; Frames hinzufügen/duplizieren/löschen/verschieben, in verschiedenen Frames und Ebenen zeichnen (Pixelzahlen per `javascript_tool`); Tile des aktuellen Frames aktualisiert sich beim Zeichnen, andere nach Undo/Redo; Undo springt zum Frame; Zeichnen auf gesperrter Ebene weiter blockiert; 65. Frame → Hinweis, kein Schritt; Reload behält Frames (v3).
- [ ] **Step 8: Commit** "Frames-Fenster: Streifen und Aktionen".

---

### Task 6: Abspielen, Onion Skin und Export-Bereich

**Files:**
- Create: `src/render/onion.ts`, `src/render/onion.test.ts`
- Modify: `src/render/Viewport.ts`, `src/ui/framesPanel.ts`, `src/main.ts`, `src/style.css`

**Interfaces:**
- Consumes: Task 1 (`compositeFrame`, `fps`, `onion`), Task 3 (Speichern von `fps`/`onion` über `onChange()` → Autosave), Task 4 (`renderSheet`, `frameFiles`, `buildZip`, `saveBlob`), Task 5 (Fenster-Container).
- Produces: `onion.ts`: `onionFrames(doc: PixelDocument): { prev: Uint32Array | null; next: Uint32Array | null } | null` (`null`, wenn `doc.onion` aus oder nur ein Frame; `prev`/`next` = `compositeFrame` des Nachbarframes, am Rand `null`, kein Umlauf); `nextPlaybackIndex(index: number, count: number): number` (`count <= 0` → 0, sonst `(index + 1) % count`). `Viewport.onion: { prev: Uint32Array | null; next: Uint32Array | null } | null` (Standard `null`).

- [ ] **Step 1: Failing tests** in `onion.test.ts`: `onionFrames` — aus, ein Frame → `null`; erster Frame: `prev null`, `next` = Composite von Frame 2; mittlerer: beide; letzter: `next null`; `nextPlaybackIndex(2, 3) === 0`, `(0, 3) === 1`, `(5, 3)` bleibt in 0..2, `count 0` → 0.
- [ ] **Step 2: Run** `npx vitest run src/render/onion.test.ts` → FAIL.
- [ ] **Step 3: Implement** `onion.ts`; `Viewport.render` zeichnet vor dem aktuellen Frame `onion.prev` getönt `255,80,80` und `onion.next` getönt `80,140,255` mit je 30 % Deckkraft (Tönung: Alpha des Pixels × 0.3, Farbe = Tönung; Offscreen-Canvas pro Seite); `main.ts` setzt vor jedem Render `view.onion = onionFrames(doc)`.
- [ ] **Step 4: Frames-Fenster:** Button Abspielen/Stopp, FPS-Schieber 1–30 mit Zahlenanzeige (setzt `doc.fps`, `onChange()`), Schalter Onion Skin (setzt `doc.onion`, `onChange()`, Zeichenfläche neu), eigene Vorschau-Canvas (nearest-neighbor, `compositeFrame` des laufenden Index); Schleife über `requestAnimationFrame` mit Zeitakkumulator (`1000 / doc.fps`), Index über `nextPlaybackIndex(index, doc.frames.length)` bei **jedem** Schritt neu berechnet, damit eine geänderte Frame-Liste keinen Fehler erzeugt; stoppt beim Schließen des Fensters, bei `attach()` und wenn nur noch ein Frame existiert (Button zeigt dann Abspielen, deaktiviert).
- [ ] **Step 5: Export-Bereich:** Layout (Streifen waagerecht / senkrecht / Raster), Spaltenzahl (nur bei Raster, 1..Frameanzahl, Standard `ceil(sqrt(n))`), Skalierung 1×/2×/4×/8× (Standard 1×), Buttons **Spritesheet (PNG)** → `saveBlob(await renderSheet(…), 'spritesheet.png', 'image/png')` und **Einzelbilder (ZIP)** → `saveBlob(new Blob([buildZip(await frameFiles(doc, scale))], { type: 'application/zip' }), 'frames.zip', 'application/zip')`; während des Exports Buttons deaktiviert, Fehler zeigen `showToast('Export fehlgeschlagen')`.
- [ ] **Step 6: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 7: Verifikation im Browser** (Mobil-Viewport Hoch- und Querformat): Onion Skin an/aus mit zwei Frames (Pixelzahlen der Tönung per `javascript_tool` bzw. Canvas-Auslesen; am ersten Frame kein „Vorher“); Abspielen mit FPS 1 und 30 (Vorschau-Index wechselt; Schließen des Fensters stoppt, Frame-Liste ändern — letzten Frame löschen, auf einen Frame reduzieren — ohne Konsolenfehler); Reload behält `fps`/`onion`; Spritesheet: Blob laden (Bild), Maße prüfen (z. B. 3 Frames 16×16 → Streifen 48×16, senkrecht 16×48, Raster 2 Spalten 32×32; Skalierung 2× verdoppelt), Pixel einer bekannten Position gegen den Frame; ZIP: Datei holen (`fetch` auf den Blob-URL oder Download abfangen) und mit `buildZip`-Struktur prüfen (Signatur, Eintragszahl, Namen `frame-001.png` …); v2-Stand aus der Vorgängerversion (per IndexedDB eingespielt) lädt zu einem Frame.
- [ ] **Step 8: Commit** "Abspielen, Onion Skin und Export-Bereich".

---

### Abschluss

- [ ] Alle Tests und die Typprüfung laufen; `git status` ist sauber.
- [ ] Kein Push und kein `npm run deploy` ohne ausdrückliche Freigabe des Nutzers.
