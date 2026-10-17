# Konsolenexport (PICO-8, Picotron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klexel exportiert Bild oder Frames als neue `.p8`- bzw. `.gfx`-Datei für PICO-8 und Picotron, mit Farbreduzierung, Vorschau und sichtbaren Größengrenzen.

**Architecture:** Reine, DOM-freie Funktionen berechnen aus den Frame-Pixeln einen `ExportPlan` (Sprites als Palettenindizes, Zähler angepasster Farben, Grenzprobleme). Zwei Schreiber machen daraus Dateitext. Ein Dialog (`consoleExportDialog.ts`) zeigt Plan, Vorschau und Hinweise und ruft `saveBlob`. Einstieg ist ein Button im Export-Bereich des Frames-Panels.

**Tech Stack:** TypeScript, Vite, Vitest (Node-Umgebung, kein DOM in Tests), vorhandene Dialog-/CSS-Muster (`aboutDialog.ts`, `style.css`).

**Spec:** `../specs/2026-10-18-konsolenexport-design.md`

## Global Constraints

- Immer eine **neue Datei**; das Dokument wird nie verändert.
- Zwei Modi: `'slice'` (Bild zerschneiden) und `'frames'` (jeder Frame ein Sprite).
- PICO-8: 16 Farben (`PICO8` aus `src/palette/palettes.ts`), Spritegröße fest 8, Blatt 128×128, 256 Sprites, Hexzeichen je Pixel.
- Picotron: 64 Farben, Spritegröße 8 / 16 (Standard) / 32, 256 Sprites je `.gfx`, Sprite 0 reserviert; Startnummer-Vorgabe 1.
- Transparenz: Alpha < 128 = transparent; transparent wird als Index 0 geschrieben; deckende Pixel, die auf Index 0 fielen, werden auf die nächste **andere** Palettenfarbe abgebildet und zählen als „angepasst".
- „Farben angepasst" = Anzahl **verschiedener** deckender Eingabefarben, die nicht exakt in der Zielpalette vorkommen (oder wegen der Index-0-Regel verschoben wurden).
- Passt etwas nicht: Export gesperrt, bis der Nutzer „Abschneiden" wählt (keine Vorauswahl) oder die Einstellungen ändert.
- Farbwerte sind `Color` = `0xRRGGBBAA` (`src/model/Document.ts`).
- Texte auf Deutsch, im Ton der vorhandenen UI. Tests mit Vitest: `npm test` im Ordner `D:\source\docs\pixelart`.

## Review Focus

- Einfarbig transparentes Bild: Export läuft, alle Indizes 0, kein Farbhinweis.
- Bild 1×1 oder kleiner als eine Zelle: wird zu einem aufgefüllten Sprite, nicht abgelehnt.
- Bildbreite kein Vielfaches der Zellgröße (z. B. 20×20 bei Zelle 16): Randzellen aufgefüllt, nichts abgeschnitten.
- Startnummer so groß, dass nichts mehr passt (z. B. 256): Problem „keine Sprites", Export gesperrt, kein Absturz.
- Deckendes Schwarz (`#000000FF`) im Bild: wird nicht durchsichtig, sondern nächste andere Farbe.
- PICO-8 mit 17 Frames à 16×16 (2×2-Blöcke): Blocklayout läuft nicht über den Blattrand (Test in Task 2).
- 64 Frames (`MAX_FRAMES`) bei Picotron mit Zelle 32: passt (64 ≤ 255), kein Issue.

---

### Task 1: Palettendaten und Farbreduzierung

**Files:**
- Create: `src/palette/picotron.ts`, `src/export/console/reduce.ts`
- Test: `src/export/console/reduce.test.ts`

**Interfaces:**
- Produces:
  - `PICOTRON: Color[]` (genau 64 Einträge) aus `src/palette/picotron.ts`.
  - `type ConsoleTarget = 'pico8' | 'picotron'` und `TARGET_PALETTE: Record<ConsoleTarget, Color[]>` in `reduce.ts`.
  - `reducePixels(pixels: Uint32Array, palette: Color[]): { indices: Uint8Array; adjusted: Set<Color>; mapped: Uint32Array }`. `indices[i]` = Palettenindex (0 für transparent); `adjusted` = verschiedene Eingabefarben, die angepasst wurden; `mapped[i]` = die tatsächlich geschriebene Farbe als `Color` (transparente Pixel `0x00000000`). Für die Vorschau.

- [ ] **Step 1: Picotron-Palette beschaffen.** Die 64 RGB-Werte der Picotron-Standardpalette aus dem Picotron-Handbuch (`https://www.lexaloffle.com/dl/docs/picotron_manual.html`, Abschnitt zur Standardpalette/`pal()`, ab Zeichen 100000 lesen) bzw. aus dem Lexaloffle-Forum holen. Finden sich keine verlässlichen Werte, hier stoppen und den Nutzer um ein Picotron-Screenshot der Palette bitten. In `src/palette/picotron.ts` als `export const PICOTRON: Color[]` ablegen (dasselbe `rgb()`-Hilfsmuster wie in `palettes.ts`; `rgb` dort exportieren, falls nötig). Kommentar mit Quelle.
- [ ] **Step 2: Failing tests** in `reduce.test.ts`: `PICOTRON.length === 64`; `PICO8.length === 16`; (a) exakte Palettenfarbe `PICO8[8]` → Index 8, `adjusted.size === 0`; (b) `0xff0000ff` → Index 8 (`#ff004d`, nächste Farbe), `adjusted` enthält `0xff0000ff`; (c) Alpha 0x7f → Index 0, nicht in `adjusted`; Alpha 0x80 gilt als deckend; (d) deckendes `0x000000ff` → Index ≠ 0 und `adjusted` enthält es; (e) dieselbe angepasste Farbe in zwei Pixeln zählt einmal; (f) `mapped` enthält für Index-8-Treffer `PICO8[8]`.
- [ ] **Step 3: Run:** `npm test -- reduce` → FAIL (Modul fehlt).
- [ ] **Step 4: Implement** `reducePixels` und die beiden Exporte in `reduce.ts`. Nächste Farbe über quadrierten RGB-Abstand; bei Gleichstand der kleinere Index. Eine Palettenfarbe, die selbst Index 0 ist, wird für deckende Pixel übersprungen.
- [ ] **Step 5: Run:** `npm test -- reduce` → PASS.
- [ ] **Step 6: Commit** (`feat: Konsolenpaletten und Farbreduzierung`).

---

### Task 2: Export-Plan (Zuschnitt, Nummerierung, Grenzen)

**Files:**
- Create: `src/export/console/plan.ts`
- Test: `src/export/console/plan.test.ts`

**Interfaces:**
- Consumes: `reducePixels`, `TARGET_PALETTE`, `ConsoleTarget` (Task 1).
- Produces (alles in `plan.ts`):
  ```ts
  export type ExportMode = 'slice' | 'frames';
  export interface ExportFrame { pixels: Uint32Array; width: number; height: number }
  export interface ExportOptions { target: ConsoleTarget; mode: ExportMode; cell: number; start: number; truncate: boolean }
  export interface PlanSprite { index: number; w: number; h: number; indices: Uint8Array; mapped: Uint32Array; original: Uint32Array }
  export interface PlanIssue { kind: 'count' | 'crop' | 'empty'; message: string }
  export interface ExportPlan { sprites: PlanSprite[]; adjusted: number; issues: PlanIssue[]; dropped: number; blocked: boolean }
  export function defaultCell(target: ConsoleTarget, frames: ExportFrame[]): number
  export function buildExportPlan(frames: ExportFrame[], opts: ExportOptions): ExportPlan
  ```
  Bedeutung: PICO-8-Sprites sind immer 8×8 (`cell` wird ignoriert), `index` ist die absolute Spritenummer. Picotron-Sprites sind `cell`×`cell`. `dropped` = Zahl entfernter Sprites/Zellen bei `truncate`; `blocked = issues.length > 0 && !opts.truncate`. `slice` nutzt nur `frames[0]`. `original` enthält die unreduzierten Pixel desselben Zuschnitts (für „Original" halten).

- [ ] **Step 1: Failing tests** in `plan.test.ts` (Hilfsfunktion `solid(w, h, color)` für Frames):
  - `slice`, Picotron, Zelle 16, 20×20-Bild, Start 1 → 4 Sprites mit Indizes 1,2,3,4 (zeilenweise), jedes 16×16; Randzellen mit Index 0 aufgefüllt; keine Issues.
  - `slice`, PICO-8, 16×16-Bild, Start 1 → 4 Sprites 1,2,3,4 (8×8 je Zelle).
  - Picotron, Start 255, `slice` 20×20 (4 Zellen) → `issues` enthält `kind:'count'`, `blocked === true`; mit `truncate:true` → 1 Sprite (Index 255), `dropped === 3`, `blocked === false`.
  - Start 256 → `kind:'empty'`, 0 Sprites, blocked.
  - `frames`, PICO-8, drei 8×8-Frames, Start 1 → Indizes 1,2,3.
  - `frames`, PICO-8, 17 Frames à 16×16 (2×2-Block): Block k oben links bei Zelle `(k % 8) * 2 + floor(k / 8) * 32`, Zeilen von Zellen = 2 Zeilen je Blockzeile, nichts jenseits Spalte 15; Start 1 wählt nur die Startblockzeile (Zeile 0).
  - `frames`, Picotron, 24×24-Frame bei Zelle 16 → Issue `kind:'crop'`, blocked; bei `truncate` auf 16×16 beschnitten.
  - `defaultCell('picotron', frames)` → 16 für 16×16-Frames, 32 für 20×20, 8 für 8×8, 32 für größere; `defaultCell('pico8', …)` → 8.
  - Alle Sprites: `adjusted` zählt verschiedene angepasste Farben über das ganze Ergebnis.
  - Einfarbig transparentes Bild → alle Indizes 0, `adjusted === 0`.
- [ ] **Step 2: Run:** `npm test -- plan` → FAIL.
- [ ] **Step 3: Implement** `buildExportPlan` und `defaultCell` wie in der Spec („Umsetzung der Daten"). Entscheidungen, die die Spec offenlässt, hier festgelegt: PICO-8-Blocklayout wie im Test (Blockbreite `bw = ceil(frameW/8)`, Blockhöhe `bh = ceil(frameH/8)`, Block-Slots pro Zeile `floor(16/bw)`; Frames, die breiter als 128 oder höher als 128 sind, ergeben `crop`); Zellenzahl ohne Rest = `ceil(w/cell) * ceil(h/cell)`. Reduzierung einmal je Plan, `adjusted` summiert über `Set` aller Sprites.
- [ ] **Step 4: Run:** `npm test -- plan` → PASS.
- [ ] **Step 5: Commit** (`feat: Exportplan mit Zuschnitt und Grenzprüfung`).

---

### Task 3: PICO-8-Schreiber

**Files:**
- Create: `src/export/console/pico8.ts`
- Test: `src/export/console/pico8.test.ts`

**Interfaces:**
- Consumes: `ExportPlan`/`PlanSprite` (Task 2).
- Produces: `writePico8(plan: ExportPlan): string`.

- [ ] **Step 1: Failing tests:** Plan mit einem 8×8-Sprite an Index 1, erste Pixelzeile Indizes `[0,1,2,3,4,5,6,7]`, Rest 0 → Ausgabe beginnt mit `pico-8 cartridge // http://www.pico-8.com\nversion 41\n__lua__\n__gfx__\n`; danach genau 128 Zeilen à 128 Hexzeichen (`0`–`f` klein); Zeile 0 = `"0".repeat(8) + "01234567" + "0".repeat(112)`; Sprite an Index 17 (Zelle (1,1)) liegt in Zeile 8 ab Spalte 8. Indizes ≥ 10 als `a`–`f`. Endet mit Zeilenumbruch.
- [ ] **Step 2: Run:** `npm test -- pico8` → FAIL.
- [ ] **Step 3: Implement** `writePico8`: leeres 128×128-Blatt, Sprite `n` an `(n % 16, floor(n / 16))`. Kopf wie in `D:\source\docs\MoodyPiano.p8` (Version 41).
- [ ] **Step 4: Run:** `npm test -- pico8` → PASS.
- [ ] **Step 5: Commit** (`feat: PICO-8-Schreiber (.p8)`).

---

### Task 4: Picotron-Schreiber (Textform) und Palettentest-Datei

**Files:**
- Create: `src/export/console/picotron.ts`
- Test: `src/export/console/picotron.test.ts`

**Interfaces:**
- Consumes: `ExportPlan` (Task 2).
- Produces:
  - `writePicotron(plan: ExportPlan, cell: number, now?: Date): string`
  - `picotronPaletteTest(): ExportPlan`: Plan mit 63 Sprites 16×16; Sprite `k` (1..63) ist einfarbig in Palettenindex `k`; Sprite 0 bleibt leer. Nur für die manuelle Prüfung in Task 6, **nicht** in der UI.

- [ ] **Step 1: Failing tests:** Ausgabe beginnt mit `--[[pod_format="raw",created="` (Zeitstempel `YYYY-MM-DD HH:MM:SS` aus `now`), enthält genau 256 Einträge (Indizes 0–255; Zählung über `bmp=userdata(` = 256), Eintrag 0 ist `[0]={…}`; Sprite an Index 1 mit Pixeln `[1,2,0,…]` enthält `userdata("u8",16,16,"0102000000…")` (zwei Hexzeichen je Pixel, Zeile für Zeile, genau 16·16·2 Zeichen); unbelegte Einträge sind `{bmp=userdata("u8",16,16),flags=0,pan_x=0,pan_y=0,zoom=8}`; Tabelle endet mit `}` ohne Komma; `picotronPaletteTest()` liefert 63 Sprites mit Index k und überall Palettenindex k.
- [ ] **Step 2: Run:** `npm test -- picotron` → FAIL.
- [ ] **Step 3: Implement** gemäß Spec („Schreibweg"): Kopf `--[[pod_format="raw",created="…",modified="…",revision=1]]` direkt gefolgt von `{[0]={bmp=…,flags=0,pan_x=0,pan_y=0,zoom=8},{…},…}`. Die Form ist **ungeprüft**; die Anpassung nach Task 6 bleibt auf diese Datei beschränkt.
- [ ] **Step 4: Run:** `npm test -- picotron` → PASS.
- [ ] **Step 5: Commit** (`feat: Picotron-Schreiber (.gfx, Textform)`).

---

### Task 5: Dialog und Einstieg

**Files:**
- Create: `src/ui/consoleExportDialog.ts`
- Modify: `src/ui/framesPanel.ts:64-65` (Button `.fx-console` neben `.fx-sheet`/`.fx-zip`, Handler öffnet den Dialog), `src/style.css`
- Test: keine DOM-Tests (Projekt hat keine); Verhalten über Task 6.

**Interfaces:**
- Consumes: `buildExportPlan`, `defaultCell`, `ExportOptions` (Task 2); `writePico8` (3); `writePicotron` (4); `saveBlob` (`src/export/saveBlob.ts`); `PixelDocument.compositeFrame(frameId)`, `doc.frames`, `doc.width`, `doc.height`; `showToast`.
- Produces: `createConsoleExportDialog(): { open(doc: PixelDocument): void }`.

- [ ] **Step 1: Implement** den Dialog nach dem Muster von `aboutDialog.ts` (`<dialog>` an `#app`, Schließen per Klick auf den Hintergrund) mit: Ziel (PICO-8/Picotron), Modus, Spritegröße (nur Picotron; 8/16/32, Vorgabe `defaultCell`), Startnummer (Vorgabe 1). Bei jeder Änderung `buildExportPlan` neu berechnen (Frames einmal beim Öffnen aus `compositeFrame` lesen). Spritegröße-Wahl ist bei „frames" und PICO-8 ausgeblendet/ignoriert.
- [ ] **Step 2: Vorschau** auf einem `<canvas>`: Sprites an ihren Blattpositionen (PICO-8: 128×128-Blatt, Picotron: Raster mit 16 Spalten), Raster und Sprite-Nummern eingezeichnet, hochskaliert ohne Glättung. Zeichnet `mapped`; solange die Taste „Original" (Pointer-down/up und Tastatur Leertaste/Enter) gehalten wird, `original`. Abgeschnittene Sprites erscheinen abgedunkelt (dafür liefert Task 2 nur die behaltenen; abgedunkelt wird als zusätzliche Zeichenroutine über dem verworfenen Bereich nach der im Plan berechneten Reihenfolge ohne `truncate` — Umsetzer: Plan einmal mit `truncate:true` und einmal mit `false` berechnen und Differenz abdunkeln).
- [ ] **Step 3: Hinweise.** `plan.adjusted > 0` → Zeile `⚠ N Farben angepasst` und Taste „Original" sichtbar; sonst beides versteckt. `plan.issues` → jede `message` als Warnbox mit zwei Schaltflächen **Abschneiden** (setzt `truncate = true`) und **Abbrechen** (schließt); beide ohne Vorauswahl. „Exportieren" ist `disabled`, solange `plan.blocked`.
- [ ] **Step 4: Export.** PICO-8 → `writePico8(plan)`, Dateiname `klexel.p8`, MIME `text/plain`; Picotron → `writePicotron(plan, cell)`, Dateiname `0.gfx`, MIME `text/plain`. Über `saveBlob`; Fehler → `showToast('Export fehlgeschlagen')`.
- [ ] **Step 5: Einstieg.** Button `Konsole (PICO-8 / Picotron)` mit Klasse `fx-console` im Export-Bereich von `framesPanel.ts`, Handler `consoleDialog.open(deps.getDoc())`; Dialog einmal beim Erzeugen des Panels anlegen. Stil in `style.css` im Muster der vorhandenen `fx-*`/`about-*`-Regeln (Touch-Größen wie andere Buttons).
- [ ] **Step 6: Build:** `npm run build` → fehlerfrei (`tsc --noEmit`). `npm test` → alle PASS.
- [ ] **Step 7: Commit** (`feat: Konsolenexport-Dialog`).

---

### Task 6: Prüfung mit echten Programmen (Nutzer beteiligt)

**Files:**
- Modify (nur bei Bedarf): `src/export/console/picotron.ts`, `src/export/console/pico8.ts`, `src/palette/picotron.ts`

- [ ] **Step 1: PICO-8.** Mit `npm run dev` ein Bild (Farben außerhalb der Palette, Transparenz, 16×16) exportieren, `.p8` in PICO-8 öffnen. Erwartung: Sprite-Editor zeigt die Sprites an den Nummern der Vorschau, durchsichtige Pixel wie schwarz/transparent, kein Fehler beim Laden.
- [ ] **Step 2: Picotron-Palettentest.** Einmalig `picotronPaletteTest()` über ein Wegwerf-Skript/Test (`vitest`-Ausgabe in Datei oder `node`-Aufruf) als `0.gfx` schreiben, in Picotron laden und mit der Picotron-Palette vergleichen. Abweichende Farben in `src/palette/picotron.ts` korrigieren; außerdem prüfen, ob Index 0 in Picotron durchsichtig ist (Spec-Annahme) und die Regel gegebenenfalls anpassen (Spec-Eintrag „Transparenz im Ziel").
- [ ] **Step 3: Picotron-Export.** Ein 16×16-Bild exportieren, `0.gfx` in Picotron öffnen. **Lädt Picotron die Textform nicht** (Fehler, leer, oder abweichende Darstellung): stoppen und dem Nutzer berichten; dann neuer Plan für den komprimierten Schreibweg (LZ4 + `pxu`, Beispiel `D:\source\docs\0.gfx`, entpackbar mit dem Skript in der Session-Scratchpad `unlz4.py`). Lädt sie: weiter.
- [ ] **Step 4: Gesamtlauf** `npm test` und `npm run build` → PASS. Ergebnis (Version/Datum der getesteten Programme) als Kommentar-Zeile in `picotron.ts` und `pico8.ts`.
- [ ] **Step 5: Commit** (`fix: Konsolenexport gegen PICO-8/Picotron geprüft`).

---

## Self-Review (Kurzfassung)

- **Spec-Abdeckung:** Modi und Raster (T2), Reduzierung/Index-0-Regel/Hinweiszähler (T1), Grenzen gesperrt/abgeschnitten (T2, T5), Vorschau mit „Original" und Abdunkeln (T5), PICO-8-Datei (T3), Picotron-Datei und Verzweigung bei Nichtladen (T4, T6), Palette (T1, T6), neuer Dateiname/`saveBlob` (T5). Nicht abgedeckt wie in der Spec ausgeschlossen: Import, Flags, Map/Sound, JSON.
- **Typkonsistenz:** `ConsoleTarget`, `ExportPlan`, `PlanSprite` stammen aus T1/T2 und werden in T3–T5 mit denselben Namen genutzt; `writePicotron(plan, cell, now?)` in T4 und T5 gleich.
- **Entscheidungen des Planers (Spec ließ offen):** Einstieg im Frames-Panel; PICO-8-Blocklayout und Startzeile bei Blöcken; Picotron-`frames`-Zelle zu groß = `crop`-Problem; Version-Kopf `41`; Index 0 ungeprüft (in T6 geprüft); Palette-Testdatei in T4/T6.
