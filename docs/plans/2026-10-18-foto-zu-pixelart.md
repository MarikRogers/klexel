# Foto → Pixelart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Foto wird geladen, auf eine wählbare Pixelgröße verkleinert, auf eine Palette (mit optionalem Dithering) abgebildet und ersetzt als neues Bild das aktuelle Dokument.

**Architecture:** Zwei reine, DOM-freie Module (`resize.ts`: Geometrie + Flächenmittel; `quantize.ts`: Palettenabbildung mit Dithering) bilden den Kern. Ein Dialog (`photoDialog.ts`) lädt die Datei, zeigt die Vorschau, erlaubt das Verschieben des Ausschnitts und ersetzt nach Abfrage das Dokument über einen Callback. Ein Button „Foto" in der Dateizeile von `main.ts` startet den Ablauf.

**Tech Stack:** TypeScript, Vite, Vitest (Node, kein DOM in Tests), vorhandene Dialog-/CSS-Muster (`consoleExportDialog.ts`, `style.css`).

**Spec:** `../specs/2026-10-18-foto-zu-pixelart-design.md`

## Global Constraints

- Zielgröße 1–128 je Seite (`MAX_SIZE` in `src/model/Document.ts`); Schnellwahl 16/32/64; Vorgabe 32×32.
- Modi: `'crop'` (Zuschneiden, Ausschnitt verschiebbar), `'fit'` (Einpassen, Ränder transparent), `'keep'` (Verhältnis behalten, nur längste Seite).
- Paletten: `PICO8` (`src/palette/palettes.ts`), `PICOTRON` (`src/palette/picotron.ts`), „Aktuelle" = Farbfelder aus `main.ts` (`palette`).
- Bei PICO-8 und Picotron wird die **erste Palettenfarbe (Index 0, Schwarz) nicht verwendet**; bei „Aktuelle" ist jede Farbe erlaubt.
- Alpha < 128 bleibt transparent (Pixelwert `0`), alles andere wird deckend (Alpha 255).
- Dithering: `'none'` (Vorgabe), `'bayer'` (4×4, deterministisch), `'floyd'` (7/16, 3/16, 5/16, 1/16, zeilenweise links→rechts). Keine Zufallswerte.
- Verkleinern mit Flächenmittel (alpha-gewichtet), nicht Nearest-Neighbor.
- Das Ergebnis ersetzt das aktuelle Dokument (eine Ebene, ein Frame, neue History); Abfrage „Das aktuelle Bild wird ersetzt. Fortfahren?" nur bei nicht leerem Bild. Farbfelder bleiben unverändert.
- Farbwerte sind `Color` = `0xRRGGBBAA`. Texte auf Deutsch. Tests: `npm test` im Ordner `D:\source\docs\pixelart`.

## Review Focus

- Foto 1×1 oder kleiner als die Zielgröße: wird hochskaliert, kein Absturz, kein NaN.
- Extremes Seitenverhältnis (8000×10 Panorama) im Modus „Verhältnis behalten", längste Seite 32: andere Seite mindestens 1.
- Vollständig transparentes PNG: Ergebnis vollständig transparent, kein Fehler.
- „Aktuelle" Palette mit 1 Farbe oder 0 Farben: kein Absturz, verständlicher Hinweis; „Übernehmen" gesperrt bei 0 Farben.
- Hochformat-Foto im Modus „Einpassen": Ränder links/rechts transparent, Foto mittig, nichts abgeschnitten.
- Schwarz im Foto bei PICO-8/Picotron: wird nie Index 0 (Palettenfarbe 0), bei „Aktuelle" bleibt Schwarz möglich.

---

### Task 1: Verkleinern (Geometrie und Flächenmittel)

**Files:**
- Create: `src/photo/resize.ts`
- Test: `src/photo/resize.test.ts`

**Interfaces:**
- Produces (alles in `resize.ts`):
  ```ts
  export type FitMode = 'crop' | 'fit' | 'keep';
  export interface PhotoImage { width: number; height: number; pixels: Uint32Array }
  export interface ResizeOptions { mode: FitMode; width: number; height: number; longest: number; panX: number; panY: number }
  export interface Rect { x: number; y: number; w: number; h: number }
  export function keepSize(srcW: number, srcH: number, longest: number): { width: number; height: number }
  export function cropRect(srcW: number, srcH: number, tw: number, th: number, panX: number, panY: number): Rect
  export function boxResize(src: PhotoImage, rect: Rect, outW: number, outH: number): Uint32Array
  export function resizePhoto(src: PhotoImage, o: ResizeOptions): PhotoImage
  ```
  `panX`/`panY` ∈ [0,1] (0 = links/oben, 1 = rechts/unten, 0.5 = mittig; Werte außerhalb werden geklemmt). `Rect` ist in Quellpixeln, darf gebrochene Werte haben. `boxResize` mittelt alpha-gewichtet: Ergebnis-RGB = Summe(RGB·Alpha)/Summe(Alpha), Ergebnis-Alpha = mittleres Alpha (gerundet); Summe(Alpha)=0 → Pixel `0`. `resizePhoto` liefert für `crop` und `fit` die Größe `width×height`, für `keep` `keepSize(...)`; `longest`, `width`, `height` werden auf 1–128 geklemmt und auf ganze Zahlen gerundet.

- [ ] **Step 1: Failing tests** in `resize.test.ts` (Helfer `img(w, h, f)` baut ein `PhotoImage`):
  - `keepSize(4000, 3000, 32)` → `{ width: 32, height: 24 }`; `keepSize(3000, 4000, 32)` → `{ 24, 32 }`; `keepSize(8000, 10, 32)` → `{ 32, 1 }`; `keepSize(10, 10, 500)` → `{ 128, 128 }`; `keepSize(1, 1, 0)` → `{ 1, 1 }`.
  - `cropRect(400, 300, 32, 32, 0.5, 0.5)` → `{ x: 50, y: 0, w: 300, h: 300 }`; mit `panX` 0 → `x: 0`, mit 1 → `x: 100`; `cropRect(300, 400, 32, 32, 0.5, 1)` → `{ x: 0, y: 100, w: 300, h: 300 }`; `cropRect(100, 100, 64, 32, 0.5, 0.5)` → `{ x: 0, y: 25, w: 100, h: 50 }`; `panX: 7` wird auf 1 geklemmt.
  - `boxResize`: 2×2-Bild mit vier verschiedenen deckenden Farben → 1×1 ergibt den RGB-Durchschnitt (Alpha 255); 2×2 mit zwei transparenten Pixeln (`0`) und zwei roten (`0xff0000ff`) → 1×1 ist `0xff0000ff` (alpha-gewichtet: transparent zählt nicht zum RGB, Alpha = 128 gerundet aus 510/4); komplett transparentes Bild → alles `0`; 1×1-Bild → 4×4 hochskaliert: alle 16 Pixel gleich der Quellfarbe; `Rect` mit gebrochenen Werten (`x: 0.5`) liefert keine NaN (`pixels.every(v => Number.isInteger(v))`).
  - `resizePhoto` Modus `fit`: Hochformat 100×200 → 32×32: Pixel in den linken 8 und rechten 8 Spalten sind `0`, die mittleren 16 Spalten gefüllt (Foto einfarbig rot), Höhe voll. Modus `crop`: ergibt `32×32` ohne transparente Pixel bei deckendem Foto. Modus `keep`, 400×300, `longest: 32` → `32×24`.
- [ ] **Step 2: Run** `npm test -- photo/resize` → FAIL (Modul fehlt).
- [ ] **Step 3: Implement** die Funktionen. `cropRect`: größtmöglicher Ausschnitt mit dem Seitenverhältnis `tw/th` innerhalb des Fotos, Position `x = panX·(srcW − w)`, `y = panY·(srcH − h)`. `boxResize`: für jedes Zielpixel das Rechteck seiner Quellfläche, Randpixel anteilig gewichtet (Überdeckungsfläche × Alpha); bei Hochskalierung (Zielpixel kleiner als ein Quellpixel) genügt dieselbe Formel. `resizePhoto` `fit`: Foto per `boxResize` auf die eingepasste Größe (längere Seite = Zielseite, andere gerundet, mindestens 1) verkleinern, mittig (abgerundet) in ein transparentes `width×height`-Feld setzen.
- [ ] **Step 4: Run** `npm test -- photo/resize` → PASS.
- [ ] **Step 5: Commit** (`feat: Foto verkleinern (Geometrie, Flächenmittel)`).

---

### Task 2: Palettenabbildung mit Dithering

**Files:**
- Create: `src/photo/quantize.ts`
- Test: `src/photo/quantize.test.ts`

**Interfaces:**
- Consumes: `Color` aus `src/model/Document.ts`.
- Produces: 
  ```ts
  export type Dither = 'none' | 'bayer' | 'floyd';
  export function quantize(pixels: Uint32Array, width: number, height: number, palette: Color[], dither: Dither, skipFirst: boolean): Uint32Array
  ```
  Gibt ein neues Feld zurück; deckende Pixel bekommen eine Palettenfarbe (Alpha 255), Pixel mit Alpha < 128 sind `0`. `skipFirst` = `palette[0]` wird nie gewählt. Leere Palette (oder `skipFirst` mit nur einer Farbe) → `RangeError('Palette zu klein')`.

- [ ] **Step 1: Failing tests** in `quantize.test.ts`:
  - `none`, Palette `[0x000000ff, 0xffffffff]`, `skipFirst: false`: `0x202020ff` → Schwarz, `0xe0e0e0ff` → Weiß. Mit `PICO8` und `skipFirst: true`: `0x000000ff` ergibt `PICO8[1]` (nächste andere Farbe `#1d2b53`), nie `PICO8[0]`; mit `skipFirst: false` bleibt Schwarz `PICO8[0]`.
  - Transparenz: `0xff000040` (Alpha 64) → `0`; `0xff000080` → deckend. Auch bei `bayer` und `floyd`.
  - `bayer`: 4×4-Block aus `0x808080ff`, Palette Schwarz/Weiß: Anzahl Weiß zwischen 6 und 10 von 16; zwei Aufrufe liefern dasselbe Ergebnis; ein 4×4-Block aus `0x000000ff` bleibt komplett Schwarz, aus `0xffffffff` komplett Weiß.
  - `floyd`: 8×8 aus `0x808080ff`, Palette Schwarz/Weiß: Anzahl Weiß zwischen 24 und 40 von 64; wiederholbar; transparente Pixel in der Mitte verbreiten keinen Fehler (das Pixel rechts daneben entspricht dem Ergebnis ohne das transparente Nachbarpixel in der Zeile davor).
  - Einfarbige Palette (`[0x336699ff]`, `skipFirst: false`): alle deckenden Pixel gleich dieser Farbe; leere Palette und `skipFirst` mit einer Farbe → `RangeError`.
- [ ] **Step 2: Run** `npm test -- photo/quantize` → FAIL.
- [ ] **Step 3: Implement** `quantize`. Nächste Farbe über quadrierten RGB-Abstand (Gleichstand: kleinerer Index), Kandidaten ab Index 1 bei `skipFirst`. `bayer`: 4×4-Matrix (Standard-Bayer 0..15), pro Pixel wird vor der Suche `(M[y%4][x%4] + 0.5)/16 − 0.5` mal einer Schrittweite auf R, G, B addiert (Schrittweite 64 – Umsetzer darf nachjustieren, solange die Tests halten). `floyd`: Fehler (Eingangsfarbe minus gewählte Farbe, je Kanal) mit den Gewichten verteilen, Kanalwerte auf 0–255 klemmen; nur auf deckende Nachbarn.
- [ ] **Step 4: Run** `npm test -- photo/quantize` → PASS.
- [ ] **Step 5: Commit** (`feat: Palettenabbildung mit Bayer- und Floyd-Steinberg-Dithering`).

---

### Task 3: Dialog, Einstieg und Ersetzen

**Files:**
- Create: `src/photo/hasContent.ts`, `src/ui/photoDialog.ts`
- Modify: `src/main.ts` (Button `#photo` in `.row-file` hinter `#import`, Dateifeld, Dialog erzeugen, `attach` aufrufen), `src/style.css`
- Test: `src/photo/hasContent.test.ts`

**Interfaces:**
- Consumes: `resizePhoto`, `PhotoImage`, `ResizeOptions`, `FitMode` (Task 1); `quantize`, `Dither` (Task 2); `PICO8`; `PICOTRON`; `PixelDocument` (`doc.frames`, `doc.compositeFrame(frameId)`, `new PixelDocument(w, h)`, `doc.data`); `showToast` aus `src/ui/toast.ts`.
- Produces:
  - `docHasContent(doc: PixelDocument): boolean` in `hasContent.ts` (wahr, wenn irgendein Frame ein Pixel mit Alpha > 0 hat).
  - `createPhotoDialog(deps: { getDoc(): PixelDocument; getPalette(): Color[]; onApply(doc: PixelDocument): void }): { open(file: File): Promise<void> }` in `photoDialog.ts`.

- [ ] **Step 1: Failing tests** `hasContent.test.ts`: neues `PixelDocument(4, 4)` → `false`; nach `doc.set(1, 1, 0xff0000ff)` → `true`; Pixel in einem zweiten Frame (neuer Frame über `doc.createFrame()`/`insertFrame`, aktuellen Frame wechseln und setzen) → `true`.
- [ ] **Step 2: Run** `npm test -- hasContent` → FAIL; **Step 3: Implement** `docHasContent`; **Step 4: Run** → PASS.
- [ ] **Step 5: Dialog.** `createPhotoDialog` nach dem Muster von `consoleExportDialog.ts` (`<dialog id="photoDlg">` an `#app`, Schließen per Klick auf den Hintergrund, Schaltflächen mindestens 44 px):
  - `open(file)` dekodiert mit `createImageBitmap(file, { imageOrientation: 'from-image' })`; Fotos über 4096 Pixel an der längsten Seite werden dabei per `resizeWidth`/`resizeHeight` verkleinert. Pixel über ein Canvas als `Uint32Array` (`0xRRGGBBAA`) in ein `PhotoImage`. Schlägt das fehl: `showToast('Bild konnte nicht geladen werden')`, Dialog bleibt zu.
  - Bedienelemente: Modus (Zuschneiden/Einpassen/Verhältnis behalten); Größe (Breite und Höhe, bei „Verhältnis behalten" stattdessen eine Zahl „längste Seite"; Schnellwahl 16/32/64; Vorgabe 32×32); Palette (PICO-8, Picotron, Aktuelle); Dithering (Aus, Bayer, Floyd-Steinberg).
  - Vorschau (`<canvas>`, pixelscharf, `image-rendering: pixelated`, Hintergrund mit sichtbarer Transparenz): zeigt `quantize(resizePhoto(...))`. Die Taste „Original halten" zeigt solange gehalten das Ergebnis von `resizePhoto` ohne `quantize` (Pointer-, Tastatur- und Kontextmenü-Verhalten wie `cx-orig` in `consoleExportDialog.ts`).
  - Zuschneiden: Ziehen auf der Vorschau ändert `panX`/`panY` (nur auf der Achse, auf der der Ausschnitt Spielraum hat; Ziehen nach rechts verschiebt das Foto nach rechts, also sinkt `panX`).
  - Palette „Aktuelle" mit 0 Farben: Hinweis im Dialog, „Übernehmen" gesperrt; mit 1 Farbe: funktioniert (alle Pixel in dieser Farbe). `skipFirst` ist wahr bei PICO-8 und Picotron, falsch bei „Aktuelle".
  - „Übernehmen": bei `docHasContent(deps.getDoc())` zuerst `confirm('Das aktuelle Bild wird ersetzt. Fortfahren?')`; bei Abbruch bleibt der Dialog offen. Sonst `const d = new PixelDocument(w, h)`, die Ergebnispixel in `d.data` kopieren, `deps.onApply(d)`, Dialog schließen.
- [ ] **Step 6: Einstieg in `main.ts`:** Button `<button id="photo" title="Foto laden">` mit Symbol 🖼 in `.row-file`; ein verstecktes `<input type="file" accept="image/*" id="photoFile" hidden>`; Klick ruft `settleSelection()` und öffnet die Dateiauswahl; `onchange` ruft `photoDlg.open(file)` und leert den Wert. `createPhotoDialog({ getDoc: () => doc, getPalette: () => palette, onApply: d => { attach(d); scheduleSave(); } })`. CSS in `style.css` im Muster von `#consoleDlg`/`.cx-*`.
- [ ] **Step 7: Prüfen.** `npm run build` → fehlerfrei; `npm test` → alle PASS. Im Browser (`npm run dev`, Handy-Ansicht über `resize_window`): ein Testbild als `File` über `DataTransfer` in `#photoFile` setzen, `onchange` auslösen; Vorschau erscheint, Modus-/Größen-/Paletten-/Dithering-Wechsel aktualisiert sie, „Original halten" wechselt, „Übernehmen" ersetzt das Dokument (bei nicht leerem Bild nach Rückfrage).
- [ ] **Step 8: Commit** (`feat: Foto-zu-Pixelart-Dialog`).

---

## Self-Review (Kurzfassung)

- **Spec-Abdeckung:** drei Seitenverhältnis-Modi, Größen und Schnellwahl (T1, T3), drei Paletten und Index-0-Regel (T2, T3), Dithering (T2), Vorschau und „Original halten" (T3), Ersetzen mit Abfrage und leerem Bild ohne Abfrage (T3), Fehlerhinweis (T3), EXIF-Ausrichtung und Größenbegrenzung beim Dekodieren (T3), Transparenz/Alpha (T1, T2). Nicht abgedeckt wie in der Spec ausgeschlossen: Kamera, Lospec, Share Target, Ebene, Undo des Ersetzens.
- **Typkonsistenz:** `PhotoImage`, `ResizeOptions`, `FitMode` (T1) und `Dither`, `quantize(...)` (T2) werden in T3 mit denselben Namen und Reihenfolgen genutzt.
- **Entscheidungen des Planers (Spec ließ offen):** Bayer-Schrittweite 64 mit Nachjustierung erlaubt; Ziehrichtung im Zuschneidemodus; `confirm()` für die Abfrage (wie `alert()` im vorhandenen Code); Symbol 🖼; Panning als `panX/panY` ∈ [0,1].
