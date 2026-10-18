# Präzisionscursor mit Lupe und Pixel-perfect-Strich Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klexel bekommt einen ein- und ausschaltbaren Präzisionscursor (versetzt über dem Finger, mit Lupe, Modus Bewegen/Zeichnen) für Stift, Radierer, Linie, Rechteck, Ellipse, Füllen und Pipette sowie einen Pixel-perfect-Strich für Stift und Radierer.

**Architecture:** Reine, in Node testbare Bausteine unter `src/precision/` und `src/draw/` (Einstellungen, Zellen-Abbildung, Tipp-Erkennung, Lupen-Geometrie, Pixel-perfect-Filter, Zustandsautomat `PrecisionSession`). Die Session ruft ihre Wirkungen über eine `Effects`-Schnittstelle auf; `main.ts` liefert die Implementierung (History, Füllen, Formen, Toast) und leitet die Zeiger-Ereignisse an die Session weiter, solange der Präzisionscursor aktiv ist. Cursor wird in `Viewport.render()` gezeichnet, die Lupe ist ein eigenes DOM-Canvas in `#stage`.

**Tech Stack:** TypeScript, Vite, Vitest (Node, ohne DOM), keine neuen Abhängigkeiten.

**Spec:** `../specs/2026-10-18-praezisionscursor-design.md` (Referenz fürs Gefühl: `../prototypen/prototyp-2-versatz-doppeltipp.html`, nur ansehen, nicht kopieren)

## Global Constraints

- Versatz **84 px nach oben**, **28 px seitlich**: Rechtshänder `−28` (Cursor links vom Finger), Linkshänder `+28`. CSS-Pixel, Bildschirm → Dokument über `Viewport` (`panX`, `panY`, `zoom`), Ergebnis auf `0..w−1`, `0..h−1` begrenzt.
- Lupe: **9×9** Dokumentpixel, **12 px** pro Pixel, **108 px** Kante, Mittelpixel markiert (Akzentfarbe, im Modus Zeichnen rot), außerhalb des Dokuments dunkles Feld. Oben links, bei Cursor im Lupenbereich (Fadenkreuz-Arme `2.2 × zoom` plus 20 px Rand) oben rechts; `pointer-events: none`.
- Doppeltipp: zwei Tipps, jeder **< 300 ms** und Bewegung nicht über `TAP_THRESHOLD_PX` (6, `src/edit/gestures.ts`, `exceedsTapThreshold`), **≤ 350 ms** zwischen den Abhebezeitpunkten, **< 50 px** Abstand der Abhebepunkte.
- Standardwerte: Präzisionscursor **aus**, Hand **rechts**, Pixel-perfect **an**; gespeichert in `localStorage` unter `pixelart.precision` (immer in try/catch, fehlende oder ungültige Felder → Standardwert, alte Stände laden unverändert). Modus beim Start immer **Bewegen**, wird nicht gespeichert.
- Wirkt bei `pen`, `eraser`, `line`, `rect`, `ellipse`, `fill`, `picker`; bei `select` unsichtbar und unwirksam.
- Texte: „Zeichenmodus AN" / „Zeichenmodus AUS", Buttons „Bewegen" / „Zeichnen", „Hand: rechts" / „Hand: links", „Pixel-perfect". Touch-Ziele mindestens 44 px (Querformat 40 px wie die übrigen Buttons).
- Ein Strich, ein Tipp mit Pixel, eine Füllung, eine übernommene Form = je **ein** Undo-Schritt; Bewegen, Umschalten, Pipette, Vorschau erzeugen keinen. Ein Doppeltipp hinterlässt keine Spur: kein History-Eintrag und kein Redo-Rest.
- Entscheidungen dieses Plans (nicht aus der Spec): Startposition des Cursors = Dokumentmitte (auch nach `attach`); beim Wechsel von oder zu einem Formwerkzeug fällt der Modus auf Bewegen zurück, bei Stift ↔ Radierer bleibt er. Tests: `npm test` im Ordner `D:\source\repos\klexel`; Typprüfung `npm run build`.

## Review Focus

- Doppeltipp nach Füllen/Pipette/Stift im Modus Zeichnen: Füllung bzw. Pixel weg, Farbe zurück, `history.canRedo` bleibt `false` (kein Redo-Geist). → Task 2, Task 8.
- Zweiter Finger mitten im Strich oder in der Formvorschau: Strich verworfen (kein Undo-Schritt), Vorschau weg, Cursor behält seine Zelle. → Task 8.
- Gesperrte oder ausgeblendete Ebene im Modus Zeichnen: Hinweis, nichts verändert, kein Absturz; Pipette funktioniert trotzdem. → Task 8.
- Pixel-perfect über bereits bemalte Pixel und bei sich kreuzendem Strich: Pixel außerhalb des Strichs behalten ihren Wert; Radierer und 1-/2-Pixel-Striche unauffällig. → Task 3, Task 4.
- Kleine oder neue Dokumente (1×1, 1×N) und `attach` mitten im Zeichnen-Modus: Cursor bleibt im Dokument, Lupe ohne Fehler, Modus Bewegen, keine Vorschau. → Task 5, Task 7, Task 8.

---

### Task 1: Einstellungen

**Files:**
- Create: `src/precision/settings.ts`
- Test: `src/precision/settings.test.ts`

**Interfaces:**
- Produces: `type Hand = 'R' | 'L'`; `interface PrecisionSettings { on: boolean; hand: Hand; pixelPerfect: boolean }`; `DEFAULT_SETTINGS`; `SETTINGS_KEY = 'pixelart.precision'`; `parseSettings(raw: string | null): PrecisionSettings` (wirft nie); `loadSettings(): PrecisionSettings`; `saveSettings(s: PrecisionSettings): void` (beide mit try/catch um `localStorage`).

- [ ] **Step 0: Branch anlegen** `git switch -c feature/praezisionscursor`; Spec, Plan und `docs/prototypen/` committen (`docs: Spec, Plan und Prototypen für den Präzisionscursor`).
- [ ] **Step 1: Tests schreiben:** `parseSettings(null)` → `DEFAULT_SETTINGS` (`{ on: false, hand: 'R', pixelPerfect: true }`); `'{"on":true}'` → nur `on` ist `true`, Rest Standard; `'{"hand":"L","pixelPerfect":false}'` wird übernommen; Unsinn (`'xyz'`, `'[]'`, `'{"hand":"X","on":1}'`) → Standardwerte je Feld; Rundlauf über `JSON.stringify`.
- [ ] **Step 2:** `npx vitest run src/precision/settings.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren** `parseSettings`, `loadSettings`, `saveSettings` (Felder einzeln prüfen, unbekannte ignorieren).
- [ ] **Step 4:** Test erneut → PASS.
- [ ] **Step 5: Commit** `feat: Einstellungen für den Präzisionscursor`.

### Task 2: History — einzelnes Pixel zurücksetzen, letzten Schritt verwerfen

**Files:**
- Modify: `src/model/History.ts`
- Test: `src/model/history.test.ts` (neue `describe`-Gruppe am Ende, bestehende Hilfen der Datei verwenden)

**Interfaces:**
- Produces: `History.unset(x: number, y: number): boolean` — im offenen Strich: setzt das Pixel auf den Wert **vor dem Strich** zurück und entfernt es aus den Änderungen; `false`, wenn kein Strich offen ist oder für das Pixel nichts aufgezeichnet wurde. `History.dropLast(): boolean` — macht den neuesten Undo-Schritt rückgängig und **verwirft** ihn (nicht auf den Redo-Stapel); `false` bei leerem Stapel oder offenem Strich.

- [ ] **Step 1: Tests schreiben:** `unset restores the value from before the stroke` (Pixel vorher 5, im Strich auf 9 → `unset` → wieder 5); `unset after two writes returns to the original`; `unset without recorded change returns false` (auch ohne offenen Strich); `commit after unset of the only change adds no undo step` (`canUndo` bleibt `false`); `dropLast reverts and does not fill the redo stack` (nach `begin/set/commit` → `dropLast()` → Pixel zurück, `canRedo === false`, `canUndo === false`); `dropLast with open stroke returns false`.
- [ ] **Step 2:** `npx vitest run src/model/history.test.ts` → die neuen Tests FAIL.
- [ ] **Step 3: Implementieren** in `History`; `unset` wirkt auf die Ebene und den Frame, die bei `begin()` aktiv waren (`currentLayerId`, `currentFrameId`) und ruft `doc.touch(frameId)`; `dropLast` nutzt `apply(step, 'undo')` und lässt `redoStack` unberührt.
- [ ] **Step 4:** Alle History-Tests → PASS.
- [ ] **Step 5: Commit** `feat: History.unset und History.dropLast`.

### Task 3: Pixel-perfect-Filter

**Files:**
- Create: `src/draw/pixelPerfect.ts`
- Test: `src/draw/pixelPerfect.test.ts`

**Interfaces:**
- Produces: `type Pt = [number, number]`; `isLCorner(a: Pt, b: Pt, c: Pt): boolean` (`a` und `c` diagonal benachbart, `b` orthogonal benachbart zu beiden); `interface PerfectResult { unset: Pt | null; set: Pt | null }`; `class PixelPerfect { reset(): void; push(x: number, y: number): PerfectResult }` — `set` ist `null`, wenn der Punkt dem letzten gleicht; `unset` ist das mittlere Pixel einer L-Ecke aus den letzten zwei gehaltenen Punkten und dem neuen.

- [ ] **Step 1: Tests schreiben:** `isLCorner` wahr für `(0,0),(1,0),(1,1)`, `(0,0),(0,1),(1,1)` und gespiegelte Formen, falsch für gerade Linie, reine Diagonale, `a`/`c` orthogonal benachbart und für Punkte mit Abstand 2. Treppe `(0,0),(1,0),(1,1),(2,1),(2,2)` ergibt nach Anwenden der Ergebnisse die Punkte `(0,0),(1,1),(2,2)`; gerade Linie `(0,0)…(3,0)` bleibt unverändert; doppeltes `push` desselben Punkts gibt `{ unset: null, set: null }`; zwei Pixel `(0,0),(1,0)` bleiben beide; nach `reset()` beginnt eine neue Folge ohne Bezug zur alten.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: Implementieren** (Liste der gehaltenen Punkte; bei L-Ecke `b` entfernen, `c` anhängen, `unset = b`).
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `feat: Pixel-perfect-Filter`.

### Task 4: Freihandstrich mit Pixel-perfect, Schalter, in `main.ts` eingebaut

**Files:**
- Create: `src/draw/freehand.ts`, `src/ui/precisionBar.ts`
- Modify: `src/main.ts` (Zeigerlogik `apply`, `endStroke`, `pointerdown`; Einbau der Leiste), `src/style.css`
- Test: `src/draw/freehand.test.ts`

**Interfaces:**
- Consumes: `History` (`begin`, `set`, `commit`, `cancel`, `unset`), `PixelPerfect`, `linePoints` (`src/tools/line.ts`), `Color` (`src/model/Document`).
- Produces: `class FreehandStroke { constructor(getHistory: () => History, pixelPerfect: () => boolean); readonly active: boolean; begin(): void; point(x: number, y: number, c: Color): void; end(commit: boolean): void }` — `begin` ruft `history.begin()`; `point` zieht eine Linie vom letzten Punkt (oder setzt ein einzelnes Pixel) und filtert über `PixelPerfect`, wenn eingeschaltet; `end(true)` ruft `commit()`, `end(false)` ruft `cancel()`. `createPrecisionBar(deps: { getSettings(): PrecisionSettings; update(patch: Partial<PrecisionSettings>): void; getTool(): string }): { el: HTMLElement; refresh(): void }` — enthält zunächst nur den Button „Pixel-perfect" (`aria-pressed`, Klasse `active` wie bei den übrigen Buttons), sichtbar nur bei Stift/Radierer.

- [ ] **Step 1: Tests schreiben** (echte `PixelDocument(8, 8)` und `History`): `single point sets one pixel`; `pixel-perfect off draws the L corner` (Punkte `(0,0),(1,0),(1,1)` → drei gesetzte Pixel); `pixel-perfect on removes the L corner` (zwei Pixel, `(1,0)` ungesetzt); `pixels painted before the stroke keep their value when removed` (`(1,0)` vorher mit Farbe 5 in einem eigenen Schritt, Strich mit 9 über `(0,0),(1,0),(1,1)` → `(1,0)` ist wieder 5); `eraser color 0 works with pixel-perfect`; `end(true) makes exactly one undo step, end(false) none`; `a self-crossing stroke leaves pixels outside the stroke untouched`; `point after interpolation fills gaps` (`(0,0)` dann `(4,0)` setzt fünf Pixel).
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: `FreehandStroke` implementieren** in `src/draw/freehand.ts` (Linien über `linePoints`, den Startpunkt nicht doppelt durch den Filter schicken; `unset` über `history.unset`, `set` über `history.set`).
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: In `src/main.ts` einbauen:** `let settings = loadSettings()`; `const stroke = new FreehandStroke(() => history, () => settings.pixelPerfect)`. `pointerdown`: für `pen`/`eraser` `stroke.begin()` statt `history.begin()`, für `fill` weiter `history.begin()`. `apply` ruft für Stift/Radierer `stroke.point(x, y, paintColor())` und führt `last` nicht mehr; `endStroke` ruft `stroke.end(commit)`, wenn `stroke.active`, sonst wie bisher `history.commit()`/`history.cancel()`. `createPrecisionBar` einhängen wie `selectionBar.el` eingehängt wird (gleiche Stelle im DOM-Aufbau, vor `#bottom`), `update` speichert über `saveSettings`, `refresh()` in `refresh()` aufrufen; `#precbar` in `style.css` wie `#selbar` behandeln (Hoch- und Querformat, Reihenfolge `order`).
- [ ] **Step 6: Verifizieren:** `npm test` und `npm run build` fehlerfrei. Von Hand im Browser (`npm run dev`): Stift ziehen → Treppen werden zur Diagonale; Button „Pixel-perfect" aus → L-Ecken wie vorher; Einstellung bleibt nach Neuladen.
- [ ] **Step 7: Commit** `feat: Pixel-perfect-Strich mit Schalter`.

### Task 5: Zellen-Abbildung (Finger → Cursor)

**Files:**
- Create: `src/precision/cursorMap.ts`
- Test: `src/precision/cursorMap.test.ts`

**Interfaces:**
- Consumes: `Hand` (Task 1).
- Produces: `OFFSET_Y = 84`, `OFFSET_X = 28`; `interface ViewGeom { panX: number; panY: number; zoom: number }`; `fingerToCell(sx: number, sy: number, hand: Hand, v: ViewGeom, docW: number, docH: number): [number, number]` — `sx`, `sy` Canvas-lokal (wie `local(e)` in `main.ts`), Ergebnis ganze Zelle, begrenzt auf das Dokument.

- [ ] **Step 1: Tests schreiben** (`zoom: 8`, `panX = panY = 0`, Dokument 32×32): Finger `(100, 200)` Rechtshänder → `[9, 14]`, Linkshänder → `[16, 14]`; Begrenzung links/oben (`(0, 0)` → `[0, 0]`), rechts/unten (`(9999, 9999)` → `[31, 31]`) für beide Hände; mit `panX = 40, panY = 16, zoom: 4` stimmt die Verschiebung; Dokument 1×1 → immer `[0, 0]`; Dokument 1×5 klemmt jede Achse einzeln.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: Implementieren** `fingerToCell` (Rechtshänder `sx − OFFSET_X`, Linkshänder `sx + OFFSET_X`, `sy − OFFSET_Y`, dann `Math.floor((v − pan) / zoom)`, dann klemmen).
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `feat: Abbildung Finger → Cursorzelle`.

### Task 6: Tipp-Erkennung

**Files:**
- Create: `src/precision/tapDetector.ts`
- Test: `src/precision/tapDetector.test.ts`

**Interfaces:**
- Consumes: `exceedsTapThreshold` (`src/edit/gestures.ts`).
- Produces: `TAP_MAX_MS = 300`, `DOUBLE_GAP_MS = 350`, `DOUBLE_DIST_PX = 50`; `class TapDetector { down(x: number, y: number, t: number): void; move(x: number, y: number): boolean /* true, sobald die Schwelle überschritten ist */; up(x: number, y: number, t: number): 'tap' | 'doubleTap' | 'drag'; cancel(): void }` — `drag` bei überschrittener Schwelle oder Dauer ≥ 300 ms (setzt den Doppeltipp-Zustand zurück); `cancel` vergisst auch den vorigen Tipp.

- [ ] **Step 1: Tests schreiben:** kurzer Tipp → `'tap'`; zwei Tipps (`up` bei t=100 und t=250, gleiche Stelle) → `'tap'`, `'doubleTap'`; Abstand der `up`-Zeiten genau 350 → `doubleTap`, 351 → zweiter ist `'tap'`; Abstand 49 px → `doubleTap`, 50 px → `'tap'`; Dauer 299 ms → Tipp, 300 ms → `'drag'`; Bewegung 6 px → Tipp, 7 px → `'drag'`; dritter Tipp direkt nach einem Doppeltipp ist wieder `'tap'`; `cancel()` zwischen den Tipps verhindert den Doppeltipp.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: Implementieren** (Zeit wird übergeben, kein `Date.now()`).
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `feat: Tipp- und Doppeltipp-Erkennung`.

### Task 7: Lupe (Geometrie und Ansicht)

**Files:**
- Create: `src/precision/loupe.ts`, `src/ui/loupeView.ts`
- Modify: `src/style.css`
- Test: `src/precision/loupe.test.ts`

**Interfaces:**
- Consumes: `Color` (`src/model/Document`).
- Produces: `LOUPE_CELLS = 9`, `LOUPE_PX = 12`, `LOUPE_SIZE = 108`, `LOUPE_INSET_X = 10`, `LOUPE_INSET_Y = 56` (unter dem `#toggle`-Button); `loupeCells(pixels: Uint32Array, w: number, h: number, cx: number, cy: number): Array<Color | null>` (81 Einträge, zeilenweise, `null` außerhalb); `loupeSide(cursorLeft: number, cursorTop: number, zoom: number): 'left' | 'right'` (Canvas-lokale linke obere Ecke der Cursorzelle; `'right'`, wenn beide Werte kleiner sind als Inset + 108 + `2.2 × zoom` + 20); `createLoupe(stage: HTMLElement): { update(cells: Array<Color | null>, draw: boolean, side: 'left' | 'right'): void; hide(): void }` (Canvas `108 × 108` CSS-px mit `devicePixelRatio`, Schachbrett für transparente Zellen, `#0c0d10` für `null`, Mittelzelle umrandet, Klasse `loupe`, `pointer-events: none`).

- [ ] **Step 1: Tests schreiben:** `loupeCells` — Mitte liegt in Eintrag 40; Dokumentecke `(0, 0)` hat `null` in den ersten vier Spalten/Zeilen; Dokument 1×1 → 80 × `null` und Eintrag 40 ist der Pixelwert; Werte stimmen mit `pixels` überein. `loupeSide` — Cursor weit rechts unten → `'left'`; Cursorzelle bei `(20, 70)` bei Zoom 8 → `'right'`; knapp hinter der Schwelle (je 1 px) → `'left'`.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: `loupe.ts` implementieren.**
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: `loupeView.ts` implementieren** und `.loupe` in `style.css` (absolut in `#stage`, `top: 56px`, `left`/`right: 10px`, Rahmen 2 px `--accent`, `border-radius: 10px`, `z-index: 1`).
- [ ] **Step 6: Commit** `feat: Lupe`.

### Task 8: Zustandsautomat `PrecisionSession`

**Files:**
- Create: `src/precision/PrecisionSession.ts`
- Test: `src/precision/PrecisionSession.test.ts` (mit einer Fake-`Effects`, die alle Aufrufe in einer Liste protokolliert)

**Interfaces:**
- Consumes: `TapDetector` (Task 6), `Pt` (Task 3), `Color`.
- Produces:
  - `type PrecisionTool = 'pen' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'ellipse'`; `type Mode = 'move' | 'draw'`.
  - `interface Effects { blocked(): boolean /* zeigt den Hinweis selbst */; strokeBegin(): void; strokePoint(x: number, y: number): void; strokeEnd(commit: boolean): void; fill(x: number, y: number): void; pick(x: number, y: number): void; shapePreview(a: Pt, b: Pt): void; shapeCommit(): void; shapeCancel(): void; dropLast(): void; getColor(): Color; setColor(c: Color): void; say(text: string): void; changed(): void }`.
  - `class PrecisionSession { constructor(fx: Effects, map: (sx: number, sy: number) => Pt); cursor: Pt; mode: Mode; readonly active: boolean; setTool(t: string): void /* 'select' → inaktiv */; reset(center: Pt): void /* Cursor, Modus Bewegen, Vorschau weg */; setMode(m: Mode): void; down(sx: number, sy: number, t: number): void; move(sx: number, sy: number): void; up(sx: number, sy: number, t: number): void; cancel(): void }`.
- Regeln (aus der Spec): `down` springt den Cursor auf `map(sx, sy)`; Stift/Radierer im Modus Zeichnen: `strokeBegin` beim Aufsetzen (nur wenn `!blocked()`), `strokePoint` ab dem ersten Überschreiten der Schwelle von der Startzelle bis zur aktuellen Zelle, `strokeEnd(true)` beim Abheben; ein Tipp ruft `strokePoint(cursor)` und `strokeEnd(true)`. Füllen/Pipette: Aktion beim Abheben im Modus Zeichnen (Füllen nur wenn `!blocked()`); die Pipette merkt sich die vorherige Farbe. Formen: `setMode('draw')` setzt den Anker auf die Cursorzelle und ruft `shapePreview(anchor, cursor)`, Bewegung im Modus Zeichnen aktualisiert die Vorschau, `setMode('move')` ruft `shapeCommit()` (nur wenn `!blocked()`, sonst `shapeCancel()`). Doppeltipp: macht die Wirkung des ersten Tipps rückgängig (`dropLast()` bzw. `setColor(vorherige)`), verwirft den eigenen Strich des zweiten (`strokeEnd(false)`) und schaltet den Modus um (`say('Zeichenmodus AN' | 'Zeichenmodus AUS')`). `up`/`move` ohne vorheriges `down` werden ignoriert.

- [ ] **Step 1: Tests schreiben** (`map` im Test: `(x, y) => [Math.floor(x / 10), Math.floor(y / 10)]`, Zeiten in ms):
  - `move mode: touch moves the cursor and triggers no effect`
  - `draw mode pen: drag draws from the first cell and ends with one strokeEnd(true)`
  - `draw mode pen: tap paints one pixel` (`strokeBegin`, `strokePoint`, `strokeEnd(true)`)
  - `double tap in draw mode switches to move, drops the first tap and discards the second stroke` (`dropLast` genau einmal, genau ein `strokeEnd(true)`, ein `strokeEnd(false)`)
  - `double tap in move mode switches to draw and says "Zeichenmodus AN"`
  - `second tap after 351 ms is a normal tap`
  - `fill acts on release only in draw mode, once per touch`; `double tap after fill calls dropLast`
  - `picker picks on release; double tap restores the previous color`
  - `shapes: entering draw sets the anchor and previews; moving updates the end; leaving draw commits`
  - `shapes: cancel() discards the preview and returns to move`
  - `setTool: switching to or from a shape tool discards the preview and returns to move; pen to eraser keeps the mode`
  - `blocked layer: no strokeBegin, no fill, no shapeCommit; picker still works`
  - `cancel() mid-stroke calls strokeEnd(false) once and keeps the cursor`
  - `reset() puts the cursor on the given cell, mode move`
  - `select tool: active is false and down/move/up cause no effect`
  - `up and move without down are ignored`
- [ ] **Step 2:** `npx vitest run src/precision/PrecisionSession.test.ts` → FAIL.
- [ ] **Step 3: `PrecisionSession` implementieren** nach den Regeln oben.
- [ ] **Step 4:** Test → PASS; `npm test` ganz.
- [ ] **Step 5: Commit** `feat: Zustandsautomat für den Präzisionscursor`.

### Task 9: Einbau in die App

**Files:**
- Modify: `src/render/Viewport.ts`, `src/main.ts`, `src/ui/precisionBar.ts`, `src/style.css`, `docs/ideen/2026-10-18-roadmap.md`

**Interfaces:**
- Consumes: alle vorigen Tasks.
- Produces: `Viewport.cursor: { x: number; y: number; draw: boolean } | null` (gezeichnet am Ende von `render()` nach Raster und Vorschau: Fadenkreuz um die Zelle, weiß mit schwarzer Kontur, Arme `2.2 × zoom`, Linienbreite `max(2, zoom / 7)`, im Modus Zeichnen zusätzlich rote Füllung `rgba(230,57,70,.5)`); `createPrecisionBar` erweitert um `getMode(): Mode`, `setMode(m: Mode): void`, `isActive(): boolean` und die Buttons „Bewegen"/„Zeichnen" (nur sichtbar, wenn der Cursor aktiv ist) sowie „Hand: rechts/links" (sichtbar, solange der Präzisionscursor eingeschaltet ist).

- [ ] **Step 1: Cursor im `Viewport` zeichnen** (siehe Interfaces).
- [ ] **Step 2: `main.ts`:** `PrecisionSession` mit `map = (sx, sy) => fingerToCell(sx, sy, settings.hand, view, doc.width, doc.height)` erzeugen; `Effects` implementieren: `blocked` über `doc.drawBlockReason()` mit denselben Toasts wie bisher („Ebene gesperrt"/„Ebene ausgeblendet"), `strokeBegin/Point/End` über `stroke` (Farbe `paintColor()`, bei `End(true)` `scheduleSave()`), `fill` (`history.begin(); floodFill(...); history.commit(); scheduleSave()`), `pick` (wie der bisherige Pipettencode), `shapePreview/Commit/Cancel` über `shapeStart`/`shapeEnd`/`updateShapePreview`/`commitShape`/`cancelShape`, `dropLast` über `history.dropLast()` plus `scheduleSave()`, `say` über `showToast`, `changed` über `refresh`. `const precisionActive = () => settings.on && precision.active;`
- [ ] **Step 3: Zeigerlogik in `main.ts`:** In `pointerdown` nach dem Zweifinger-Zweig und nach `if (pointers.size > 2) return;`: `if (precisionActive()) { precision.down(cx, cy, e.timeStamp); refresh(); return; }`. Im Zweifinger-Zweig zusätzlich `precision.cancel()`. In `pointermove` vor `if (selGesture)`: `if (precisionActive() && pointers.size === 1) { precision.move(cx, cy); refresh(); return; }`. In `release` nach dem Zweifinger-Aufräumen: `if (precisionActive()) { precision.up(...local(e), e.timeStamp); refresh(); return; }` (Koordinaten aus `local(e)`); `pointercancel` ruft zusätzlich `precision.cancel()`.
- [ ] **Step 4: Weitere Verdrahtung:** `precision.setTool(tool)` im Werkzeug-Handler (nach `tool = …`); `precision.reset([Math.floor(doc.width / 2), Math.floor(doc.height / 2)])` am Ende von `attach` und beim Start; in `refresh()` vor `view.render()` `view.cursor = precisionActive() ? { x, y, draw } : null` setzen und die Lupe mit `loupeCells(doc.composite(), …)`/`loupeSide(…)` aktualisieren oder `hide()`; neuer Button `precisionBtn` (Titel „Präzisionscursor", Symbol ⌖) in `.row-edit` hinter `grid`, schaltet `settings.on`, speichert, ruft beim Ausschalten `precision.cancel()` und `precision.setMode('move')`; Leiste und Hand-Button wie in den Interfaces.
- [ ] **Step 5: `npm test` und `npm run build`** fehlerfrei.
- [ ] **Step 6: Von Hand prüfen** (`npm run dev`, Browser mit Geräteemulation Handy, Hoch- und Querformat): Schalter an/aus; Cursor springt mit 84 px Versatz zum Finger, Hand-Button verschiebt ihn seitlich; Lupe wechselt oben links ↔ oben rechts und verdeckt den `☰`-Button nicht; Doppeltippen und Button schalten den Modus, Hinweis erscheint; Stift zeichnet nur im Modus Zeichnen; Linie/Rechteck/Ellipse: Wechsel zu Zeichnen setzt die Ecke, Wechsel zu Bewegen übernimmt die Form (Undo nimmt sie in einem Schritt zurück); Füllen und Pipette lösen beim Abheben aus; Doppeltipp nach Füllen lässt keine Füllung und kein Redo zurück; zweiter Finger verschiebt/zoomt und verwirft einen laufenden Strich; Auswahl-Werkzeug verhält sich wie vorher; gesperrte Ebene zeigt Hinweis; mit eingezoomter Ansicht lassen sich alle Zeilen und Spalten erreichen (oberste Zeile durch Verschieben der Ansicht — falls nicht, Rand im Verschiebebereich ergänzen); Neu anlegen setzt den Cursor in die Mitte.
- [ ] **Step 7: Roadmap:** in `docs/ideen/2026-10-18-roadmap.md` einen Statusvermerk „Idee 5: Präzisionscursor, Lupe und Pixel-perfect umgesetzt; Gesten Undo/Redo und Joystick offen" ergänzen.
- [ ] **Step 8: Commit** `feat: Präzisionscursor mit Lupe in der App`.
