# Auswahl Teil 1 Implementation Plan (Rechteck, Verschieben, Zwischenablage, Spiegeln/Drehen)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Pixelart-PWA bekommt ein Auswahl-Werkzeug mit Rechteck-Auswahl und den Modi Neu/Hinzufügen/Abziehen, schwebendem Verschieben, Kopieren/Ausschneiden/Einfügen/Löschen, Spiegeln und 90°-Drehen, bedient über eine Auswahl-Leiste.

**Architecture:** Reine Logik in `src/model/Selection.ts` (Maske) und `src/edit/` (Sitzung mit schwebendem Inhalt, Transformationen). Das Anheben löscht die Quellpixel über einen **offenen History-Strich** (`begin` … `commit`/`cancel`), daher ist alles ein Undo-Schritt. `main.ts` verdrahtet Gesten, Absetzen-Regeln und Undo; `Viewport` zeichnet schwebende Pixel und den Rahmen; eine Leiste `#selbar` liefert Modi und Aktionen. Lasso und Zauberstab folgen in Teil 2.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest (Testumgebung `node`, kein DOM), Canvas 2D.

**Spec:** `docs/specs/2026-10-16-auswahl-design.md` (baut auf den Specs zu Ebenen und Animation auf)

## Global Constraints

- Auswahl = Maske (`Uint8Array`, ein Byte pro Pixel, 1 = ausgewählt) über die Dokumentfläche; leere Maske zählt als „keine Auswahl“; Auswahl wird nicht gespeichert und ist nicht Teil von Undo.
- Alle Operationen wirken auf die **aktive Ebene im aktuellen Frame** (`doc.cel(doc.activeId, doc.currentFrameId)`); eine fehlende Cel zählt als lauter `0`, `lift`/Kopieren legen keine Cel an.
- Anheben löscht die Quelle in der Ebene (`history.begin()` + `history.set(x, y, 0)`) und lässt den Strich **offen**; Verschieben ändert nur `floating.x/y`; Absetzen schreibt `blendOver(ziel, pixel, 100)` für Pixel mit Maske=1 und Alpha > 0 (Alpha 255 ersetzt, teiltransparent blendet, Alpha 0 lässt das Ziel; Pixel außerhalb der Fläche entfallen) und ruft `history.commit()` — **ein** Undo-Schritt; Abbrechen = `history.cancel()`, Maske kehrt zur Position vor dem Anheben zurück.
- `drawBlockReason() !== null` (gesperrt/ausgeblendet) blockiert Anheben, Ausschneiden, Löschen, Einfügen, Spiegeln, Drehen, Verschieben (Hinweis `Ebene gesperrt` / `Ebene ausgeblendet`, kein Schritt); Auswählen und Kopieren sind immer erlaubt.
- Drehen im Uhrzeigersinn: Quellpixel (Spalte `c`, Zeile `r`) in `w×h` → neue Breite `h`, neue Höhe `w`, Zielspalte `h − 1 − r`, Zielzeile `c`; neue Position `x' = x + trunc((w − h) / 2)`, `y' = y + trunc((h − w) / 2)`. Beispiel: Zeilen `[[1,2,3],[4,5,6]]` (3×2) → `[[4,1],[5,2],[6,3]]` (2×3); Position `(10, 20)` → `(10, 20)` (trunc(0.5) = 0, trunc(−0.5) = 0).
- Einfügen: Mitte des sichtbaren Bereichs (`viewport.toDoc` des Canvas-Zentrums), `x = round(cx − w/2)`, `y = round(cy − h/2)`, schwebend (offener Strich ohne Pixeländerung); Zwischenablage lebt nur in der App und überlebt „Neu“/Import.
- Setzen ab bei: Öffnen eines Fensters, Wechsel von Ebene, Frame oder Werkzeug, Ebenen-/Frame-Aktionen, `visibilitychange` → `hidden`; Werkzeugwechsel entfernt zusätzlich die Maske; Undo bei Schweben = `cancel()`, Redo währenddessen deaktiviert; Autosave wird während des Schwebens nicht ausgeführt.
- UI: Auswahl-Button `data-tool="select"`; Leiste `#selbar` nur bei aktivem Werkzeug; Hochformat in-flow zwischen Zeichenfläche und Werkzeugleiste (bis zu zwei Zeilen), Querformat vertikale Spalte 52 px zwischen linker Leiste und Zeichenfläche; Touch-Ziele ≥ 40 px, Safe Areas, SVG-Icons `stroke-width="1.25"`, UI-Texte deutsch.
- Bestehende 103 Tests bleiben grün; nach jedem Task laufen `npx tsc --noEmit` und `npx vitest run` ohne Fehler.

## Review Focus

- Verschieben ist **ein** Undo-Schritt: Undo stellt Quelle **und** Ziel wieder her, Redo wiederholt; Abbrechen (Undo bei Schweben) hinterlässt keinen Schritt und keinen offenen Strich (Tasks 2, 4).
- Absetzen mit teiltransparenten und transparenten Pixeln über vorhandenen Zielpixeln und am Rand der Fläche (Abschneiden, vollständig außerhalb) (Task 2).
- Jede Absetzen-Auslöser-Kette lässt **keinen** offenen History-Strich zurück: Fensteröffnen, Ebenen-/Frame-Wechsel, Werkzeugwechsel, Hintergrund (`hidden`), „Neu“/Import (`reset`), schnelle Doppelaktionen (zwei Mal ✓, Einfügen ohne Zwischenablage) (Tasks 2, 4, 5).
- Kopieren → Frame/Ebene wechseln → Einfügen; Einfügen auf gesperrter/ausgeblendeter Ebene und ohne Zwischenablage ändert nichts (Task 3).
- Spiegeln/Drehen an der Fläche: 4× Drehen = Ausgangszustand (Pixel **und** Position), Drehen über den Rand schneidet beim Absetzen ab; leere Cel und leere Auswahl erzeugen keine Fehler und keine Schritte (Task 3).

---

### Task 1: Selection-Modell

**Files:**
- Create: `src/model/Selection.ts`, `src/model/selection.test.ts`

**Interfaces:**
- Produces: `class Selection` mit `readonly width: number; readonly height: number; readonly mask: Uint8Array`; `static empty(w, h): Selection`; `static rect(w, h, x0, y0, x1, y1): Selection` (beide Ecken inklusive, Reihenfolge egal, auf die Fläche geklemmt, vollständig außerhalb → leer); `static all(w, h): Selection`; `combine(other: Selection, mode: 'replace' | 'add' | 'subtract'): Selection` (neue Instanz; `replace` = `other`; unterschiedliche Größen → `RangeError`); `isEmpty(): boolean`; `count(): number`; `contains(x, y): boolean` (außerhalb false); `bounds(): { x: number; y: number; w: number; h: number } | null`; `translated(dx: number, dy: number): Selection` (verschoben, Rand abgeschnitten); `edges(): Array<{ x: number; y: number; dir: 'h' | 'v' }>` (memoisiert, Selection ist unveränderlich): `dir 'h'` = horizontale Kante **über** dem Pixel `(x, y)` (zwischen `y−1` und `y`), `dir 'v'` = vertikale Kante **links** vom Pixel `(x, y)`; eine Kante gehört zum Rand, wenn genau eines der beiden angrenzenden Pixel ausgewählt ist (Pixel außerhalb der Fläche zählen als nicht ausgewählt); Kanten an `x = width` bzw. `y = height` erscheinen als `x: width` bzw. `y: height`.

- [ ] **Step 1: Failing tests in `src/model/selection.test.ts`:**
  - `rect` mit vertauschten Ecken ergibt dieselbe Maske wie mit richtiger Reihenfolge; `rect(8, 8, 2, 3, 4, 3)` hat `count() 3`; geklemmt: `rect(4, 4, -5, -5, 1, 1).count() === 4`; komplett außerhalb (`rect(4,4,10,10,12,12)`) ist `isEmpty()`.
  - `all(3, 2).count() === 6`; `empty(3, 2).bounds() === null`; `rect(8, 8, 2, 3, 4, 5).bounds()` = `{ x: 2, y: 3, w: 3, h: 3 }`.
  - `combine`: `add` (zwei getrennte Rechtecke → `count` 8), `subtract` (großes Rechteck minus mittleres → `contains` im Loch false, `count` korrekt), `replace` liefert Maske der zweiten; `subtract` bis leer → `isEmpty()`; ungleiche Größen → wirft; Operanden bleiben unverändert.
  - `contains(-1, 0)`, `contains(0, 99)` → false.
  - `translated`: Rechteck 2×2 bei `(1,1)` um `(+1, 0)` → `bounds` `{ x: 2, y: 1, w: 2, h: 2 }`; über den Rand (`translated(10, 0)` bei 4×4) → leer; negativ schneidet links ab (`rect(4,4,0,0,1,1).translated(-1, 0).count() === 2`).
  - `edges`: 2×2-Rechteck bei `(1,1)` in 4×4 → genau 8 Kanten; 1×1-Pixel → 4 Kanten; zwei getrennte Pixel → 8 Kanten; Rechteck am Rand (`all(2, 2)`) → 8 Kanten (inkl. `x: 2` und `y: 2`); zweiter Aufruf liefert dasselbe Array-Objekt (memoisiert); leere Auswahl → `[]`.
- [ ] **Step 2: Run** `npx vitest run src/model/selection.test.ts` → FAIL.
- [ ] **Step 3: Implement** `Selection` wie oben (die `edges`-Regel ist die einzige nicht offensichtliche Stelle; Instanzen werden nie verändert, auch die Maske nicht nach außen).
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 5: Commit** "Selection: Maske mit Rechteck, Kombination, Kanten".

---

### Task 2: Sitzung — Auswählen, Anheben, Verschieben, Absetzen, Abbrechen

**Files:**
- Create: `src/edit/SelectionSession.ts`, `src/edit/sessionCore.test.ts`
- Modify: `src/model/History.ts` (nur `get strokeOpen(): boolean`)

**Interfaces:**
- Consumes: Task 1 (`Selection`); `PixelDocument` (`cel`, `activeId`, `currentFrameId`, `width`, `height`, `drawBlockReason()`, `inBounds`), `History` (`begin/set/commit/cancel`), `blendOver` aus `src/model/Document.ts`.
- Produces: `interface Floating { pixels: Uint32Array; mask: Uint8Array; w: number; h: number; x: number; y: number }`; `interface Clip { pixels: Uint32Array; mask: Uint8Array; w: number; h: number }`; `class SelectionSession { constructor(getDoc: () => PixelDocument, getHistory: () => History); get selection(): Selection | null` (während des Schwebens: Maske des Schwebens an Position `x, y`, auf die Fläche geklemmt); `get floating(): Floating | null; get clip(): Clip | null; get hasSelection(): boolean; get isFloating(): boolean; select(shape: Selection, mode: 'replace' | 'add' | 'subtract'): void` (setzt vorher ab; Ergebnis leer → keine Auswahl); `selectAll(): void; deselect(): void` (setzt ab und entfernt die Maske); `hitTest(x: number, y: number): boolean`; `lift(): 'ok' | 'locked' | 'hidden' | 'none'` (`'none'` ohne Auswahl; sonst die Blockade aus `drawBlockReason`); `moveBy(dx: number, dy: number): 'ok' | 'locked' | 'hidden' | 'none'` (hebt bei Bedarf selbst an); `commit(): void; cancel(): void; reset(): void` (verwirft Maske und Schweben ohne Schritt — bei offenem Strich `history.cancel()` —, Zwischenablage bleibt) }`. `History.strokeOpen` = es gibt einen offenen Strich (`begin()` aufgerufen, weder `commit` noch `cancel`).

- [ ] **Step 1: Failing tests in `src/edit/sessionCore.test.ts`** (reales `PixelDocument` 8×8 und `History`, Hilfsfunktion zum Füllen der Cel):
  - `select`: `replace`/`add`/`subtract` setzen/erweitern/verkleinern `session.selection`; Ergebnis leer → `hasSelection` false; `hitTest` innerhalb true, außerhalb false; `selectAll()` → `count() === 64`; `deselect()` entfernt.
  - `lift`: Auswahl über Pixel mit Wert `5` an `(1,1)`: nach `lift()` ist `isFloating`, `history.strokeOpen`, das Pixel in der Cel ist `0`, `floating.pixels` enthält `5` an der richtigen Stelle, `floating.x/y` = Grenzen-Ecke; `lift()` ohne Auswahl → `'none'`; auf gesperrter Ebene → `'locked'` (Ebene mit `doc.setLayerProps(id, {locked:true})`), auf ausgeblendeter → `'hidden'`; jeweils `isFloating` false, `strokeOpen` false, Cel unverändert, `canUndo` unverändert; fehlende Cel (leere Ebene) → hebt „leer“ an, legt keine Cel an (`doc.cel(...) === undefined`).
  - `moveBy`: ändert `floating.x/y`, die Cel bleibt unverändert (außer dem Loch aus dem Anheben); `selection` folgt (`hitTest` an neuer Position true, an alter false); `moveBy` ohne Schweben hebt vorher an; blockierte Ebene → `'locked'` ohne Wirkung.
  - `commit`: Pixel `5` landet an Zielposition (`doc.get`), Quelle bleibt `0`, `isFloating` false, `strokeOpen` false, **genau ein** Undo-Schritt: `history.undo()` stellt `5` an der Quelle und `0` am Ziel her, `redo()` wiederholt; die Maske folgt dem Inhalt (`hitTest` am Ziel); Absetzen über den Rand: Auswahl 2×2 an `(6,6)` um `(+1,+1)` verschoben → nur das Pixel `(7,7)` bleibt, kein Fehler; komplett außerhalb → nichts geschrieben, Quelle bleibt gelöscht.
  - Alpha-Regeln beim Absetzen: Zielpixel `0xff0000ff`; schwebendes Pixel `0x0000ffff` (Alpha 255) ersetzt → `0x0000ffff`; schwebendes `0x00ff0080` (Alpha 128) über `0xff0000ff` → `blendOver(0xff0000ff, 0x00ff0080, 100)`; schwebendes `0` (Alpha 0) lässt das Ziel unverändert.
  - `cancel`: stellt die Cel wieder her (Quelle `5`), `isFloating` false, `strokeOpen` false, `canUndo` unverändert, Maske zurück an der Ausgangsposition.
  - `reset`: bei Schweben `history.cancel()` (Cel wiederhergestellt), Maske weg, `clip` unberührt (bleibt nach `reset` erhalten, falls vorher gesetzt — Test mit manuell gesetzter Zwischenablage in Task 3 ergänzt); mehrfaches `commit()`/`cancel()`/`deselect()` ohne Schweben erzeugt keinen Fehler und keinen Schritt.
  - `select` bei Schweben setzt vorher ab (ein Schritt) und ändert danach die Maske.
- [ ] **Step 2: Run** `npx vitest run src/edit/sessionCore.test.ts` → FAIL.
- [ ] **Step 3: Implement** `History.strokeOpen` und `SelectionSession` mit den Signaturen oben; `lift` kopiert die Pixel der Maske in `Floating` (Pixel außerhalb der Maske `0`, Größe der Grenzen) und löscht sie mit `history.set` im offenen Strich; `commit` blendet wie in den Global Constraints.
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 5: Commit** "Auswahl-Sitzung: Anheben, Verschieben, Absetzen".

---

### Task 3: Transformationen und Zwischenablage

**Files:**
- Create: `src/edit/transform.ts`, `src/edit/transform.test.ts`, `src/edit/sessionClip.test.ts`
- Modify: `src/edit/SelectionSession.ts`

**Interfaces:**
- Consumes: Task 2 (`SelectionSession`, `Floating`, `Clip`).
- Produces: in `transform.ts` reine Funktionen `flipFloating(f: Floating, axis: 'h' | 'v'): Floating` (spiegelt Pixel und Maske in `w×h`, Position unverändert) und `rotateFloating90(f: Floating): Floating` (Regeln aus den Global Constraints, Position `x' = x + trunc((w − h)/2)`, `y' = y + trunc((h − w)/2)`). In `SelectionSession`: `flip(axis: 'h' | 'v'): 'ok' | 'locked' | 'hidden' | 'none'`, `rotate90(): …` (heben bei Bedarf selbst an), `copy(): boolean` (`false` ohne Auswahl; schwebend: aus dem schwebenden Inhalt, sonst aus der Cel; Clip = Größe der Grenzen, Pixel außerhalb der Maske `0`), `cut(): 'ok' | 'locked' | 'hidden' | 'none'` (Kopieren + Löschen), `delete(): …` (setzt die ausgewählten Pixel auf `0` als ein Schritt `begin/set/commit`; schwebend: schwebender Inhalt wird verworfen, Quelle bleibt gelöscht, ein Schritt, Maske bleibt an der aktuellen Position), `paste(centerX: number, centerY: number): 'ok' | 'locked' | 'hidden' | 'none'` (`'none'` ohne Zwischenablage; setzt vorher ab; `history.begin()`, schwebend an `round(cx − w/2), round(cy − h/2)`; Auswahl = Clip-Maske an dieser Position), `export function undoAction(session: SelectionSession): 'cancel' | 'undo'` (`'cancel'` genau wenn `session.isFloating`).

- [ ] **Step 1: Failing tests:**
  - `transform.test.ts`: `flipFloating` horizontal und vertikal an Pixeln `[[1,2,3],[4,5,6]]` (3×2) → `[[3,2,1],[6,5,4]]` bzw. `[[4,5,6],[1,2,3]]`, Maske wird mitgespiegelt, Position gleich, zweimal gespiegelt = Original; `rotateFloating90` auf `[[1,2,3],[4,5,6]]` → `w 2, h 3`, Pixel `[[4,1],[5,2],[6,3]]`, Position `(10, 20)` → `(10, 20)`; 3×3-Beispiel mit Position `(5, 5)` bleibt `(5, 5)`; 4× Drehen ergibt Pixel, Maske, Breite/Höhe **und Position** des Ausgangs (auch für `w=4, h=1` mit Position `(2, 2)` und `w=3, h=2`); die Maske wird mitgedreht (nicht rechteckige Maske).
  - `sessionClip.test.ts` (reales Dokument/History wie Task 2): `copy` ohne Auswahl → `false`, `clip` bleibt `null`; Clip entspricht Maske (Pixel außerhalb der Maske `0`, `w/h` der Grenzen) und Cel bleibt unverändert, Kopieren auf gesperrter Ebene erlaubt; `cut` = Clip + gelöschte Pixel als **ein** Undo-Schritt (Undo stellt wieder her); `cut`/`delete` auf gesperrter/ausgeblendeter Ebene → `'locked'`/`'hidden'`, Cel unverändert, kein Schritt; `delete` ohne Auswahl → `'none'`; `delete` bei Schweben: Quelle bleibt gelöscht, kein Floating mehr, ein Undo-Schritt, `strokeOpen` false; `paste` ohne Clip → `'none'` ohne Schritt; `paste(4, 4)` platziert den Clip um die Mitte (`floating.x/y`), `isFloating`, danach `commit()` schreibt ihn auf die aktive Ebene des **aktuellen** Frames; Kopieren in Frame 1, `doc.setCurrentFrame(frame2)`, Einfügen + Absetzen schreibt nach Frame 2 und lässt Frame 1 unverändert; Einfügen auf anderer Ebene (aktive Ebene gewechselt) landet nur dort; Einfügen auf gesperrter/ausgeblendeter Ebene → `'locked'`/`'hidden'` ohne Schweben und ohne offenen Strich; Zwischenablage überlebt `reset()`; Einfügen größer als die Fläche wird beim Absetzen abgeschnitten.
  - `flip`/`rotate90` über die Sitzung: heben bei Bedarf an, transformieren das Schwebende, `'locked'`/`'none'` ohne Wirkung und ohne Schritt; nach `rotate90` ändern sich `floating.w/h`; `commit` setzt die gedrehten Pixel richtig ab (ein Undo-Schritt); `undoAction` gibt `'cancel'` bei Schweben und `'undo'` sonst.
- [ ] **Step 2: Run** `npx vitest run src/edit` → FAIL.
- [ ] **Step 3: Implement** die Funktionen und Sitzungsmethoden wie oben.
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 5: Commit** "Auswahl: Spiegeln, Drehen, Zwischenablage".

---

### Task 4: Gesten, Darstellung und Absetzen-Regeln in der App

**Files:**
- Modify: `src/main.ts`, `src/render/Viewport.ts`, `src/ui/icons.ts` (Icon `select`), `src/style.css` (nur falls nötig)

**Interfaces:**
- Consumes: Tasks 1–3 (`Selection`, `SelectionSession`, `undoAction`), `showToast`, die bestehenden Hooks `discardStroke`, `scheduleSave`, `attach`.
- Produces: `Viewport.selectionOverlay: { edges: Array<{ x: number; y: number; dir: 'h' | 'v' }>; floating: Floating | null } | null` und `Viewport.selectionPreview: { kind: 'rect'; x0: number; y0: number; x1: number; y1: number } | null` (beide Standard `null`); in `main.ts` die Variable `selMode: 'replace' | 'add' | 'subtract'` (Standard `'replace'`) und `session: SelectionSession`.

- [ ] **Step 1: Viewport:** zeichnet nach dem Gesamtbild (und vor dem Raster) die schwebenden Pixel an `floating.x/y` (`ImageData` der Floating-Pixel, nearest-neighbor, Skalierung wie das Bild; Pixel mit Maske=0 oder Alpha 0 werden nicht gezeichnet), dann den Rahmen entlang `edges` (1 px schwarz, darüber 1 px weiß gestrichelt, statisch, Linienbreite unabhängig vom Zoom) und `selectionPreview` als gestrichelten Rechteckrahmen; nichts zeichnen bei `null`.
- [ ] **Step 2: `main.ts` — Werkzeug und Gesten:** Button `data-tool="select"` (`ICON.select`, `title="Auswahl"`) in der Werkzeugleiste; `ToolName` erweitern; `session = new SelectionSession(() => doc, () => history)`; Geste für das Werkzeug `select` **vor** dem allgemeinen `drawBlockReason`-Check (die Blockprüfung gilt hier nur für das Anheben): Pointerdown in der Auswahl (`session.hitTest`) im Modus `replace` → Verschiebe-Geste (merkt die letzte Dokumentposition; erstes Pointermove → `session.moveBy(dx, dy)`, bei `'locked'`/`'hidden'` Toast `Ebene gesperrt`/`Ebene ausgeblendet` und Geste beenden); sonst Rechteck-Geste (Vorschau `view.selectionPreview`, beim Loslassen `session.select(Selection.rect(doc.width, doc.height, x0, y0, x1, y1), selMode)`; Tippen ohne Ziehen im Modus `replace` → `session.deselect()`, in `add`/`subtract` nichts); zweiter Finger beendet die Geste (Inhalt bleibt) wie bisher; nach jeder Geste `refresh()` und, wo die Ebene sich geändert hat (Absetzen, Löschen), `scheduleSave()`.
- [ ] **Step 3: Darstellung und Zustand:** `refresh()` setzt `view.selectionOverlay = session.selection ? { edges: session.selection.edges(), floating: session.floating } : null`; Undo-Button: `if (undoAction(session) === 'cancel') { session.cancel(); refresh(); return; }` (vor dem bisherigen Ablauf), Redo-Button während `session.isFloating` `disabled`; `scheduleSave`: der Timer-Callback speichert nicht, solange `session.isFloating`; `session.commit()`/`cancel()` lösen `scheduleSave()` aus.
- [ ] **Step 4: Absetzen-Regeln:** die beiden `discardStroke`-Callbacks der Fenster und das Werkzeug-Umschalten rufen zuerst `session.commit()` (Werkzeug verlassen: `session.deselect()`), dann wie bisher `endStroke(false); cancelShape();`; `attach()` (neues Dokument) ruft `session.reset()`; `document.addEventListener('visibilitychange', () => { if (document.hidden) { session.commit(); scheduleSave(); refresh(); } })`.
- [ ] **Step 5: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 6: Verifikation im Browser** (Mobil-Viewport Hoch- und Querformat; eigenen Dev-Server auf freiem Port starten, nur diesen stoppen, nie alle `node.exe`): Rechteck ziehen → Rahmen sichtbar; Verschieben durch Ziehen in der Auswahl → Loch an der Quelle, Pixel und Rahmen folgen dem Finger (Pixelzahlen per `javascript_tool`); Loslassen lässt das Schweben stehen; Werkzeugwechsel setzt ab (Pixel an neuer Position, ein Undo-Schritt, Undo stellt Quelle und Ziel wieder her); Undo bei Schweben bricht ab (Ebene wie vorher, `history`-Undo nicht verbraucht); Öffnen des Ebenen-/Frames-Fensters setzt ab; Tippen außerhalb im Modus Neu hebt die Auswahl auf; gesperrte/ausgeblendete Ebene: Verschieben zeigt den Hinweis und ändert nichts; Reload nach dem Absetzen behält das Ergebnis; kein Konsolenfehler.
- [ ] **Step 7: Commit** "Auswahl: Gesten, Darstellung, Absetzen-Regeln".

---

### Task 5: Auswahl-Leiste (Modi und Aktionen)

**Files:**
- Create: `src/ui/selectionBar.ts`
- Modify: `src/main.ts`, `src/ui/icons.ts` (neue Icons: `selAll`, `deselect`, `copy`, `cut`, `paste`, `trash` falls nicht vorhanden, `flipH`, `flipV`, `rotate`, `check`), `src/style.css`

**Interfaces:**
- Consumes: Tasks 2–4 (`SelectionSession`, `selMode`, `showToast`).
- Produces: `createSelectionBar(deps: { getSession(): SelectionSession; getMode(): 'replace' | 'add' | 'subtract'; setMode(m: 'replace' | 'add' | 'subtract'): void; getPasteCenter(): [number, number]; onChange(): void }): { el: HTMLElement; setVisible(v: boolean): void; refresh(): void }`.

- [ ] **Step 1: Leiste (`#selbar`, `hidden` anfangs, in `#app`):** Modus-Gruppe **Neu / + / −** (genau einer aktiv, Standard Neu); Aktionen **Alles**, **Aufheben**, **Kopieren**, **Ausschneiden**, **Einfügen**, **Löschen**, **↔** (horizontal spiegeln), **↕** (vertikal spiegeln), **↻** (drehen), **✓ Absetzen** (nur sichtbar, solange `session.isFloating`); Buttons mit SVG-Icons (`stroke-width="1.25"`), `title`/`aria-label` deutsch.
- [ ] **Step 2: Verhalten:** Alles → `selectAll()`; Aufheben → `deselect()`; Kopieren → `copy()`; Ausschneiden/Löschen/Spiegeln/Drehen/Einfügen rufen die Sitzungsmethoden (Einfügen mit `getPasteCenter()`) und zeigen bei `'locked'`/`'hidden'` `showToast('Ebene gesperrt' | 'Ebene ausgeblendet')`; ✓ → `commit()`; jede Aktion ruft danach `onChange()` (→ `refresh()` + `scheduleSave()`); Aktivierung: Aufheben/Kopieren/Ausschneiden/Löschen/Spiegeln/Drehen nur mit Auswahl (`disabled`), Einfügen nur mit Zwischenablage (`disabled`), die durch Sperre/Ausblenden blockierenden Aktionen bleiben antippbar (`aria-disabled`, Hinweis); Moduswechsel setzt vorher ab (`commit()`); doppelt schnell getippte Aktionen (zweimal ✓, Einfügen ohne Zwischenablage) erzeugen weder Fehler noch Schritt.
- [ ] **Step 3: `main.ts`:** Leiste erzeugen, nur bei aktivem Werkzeug `select` sichtbar (`setVisible`), `getMode/setMode` an `selMode` binden, `getPasteCenter` = `view.toDoc` des Canvas-Zentrums (auf die Fläche geklemmt), `refresh()` ruft `selectionBar.refresh()`.
- [ ] **Step 4: CSS:** Hochformat: `#selbar` als Flex-Zeile zwischen `#stage` und `#bottom` (in der DOM-Reihenfolge), umbrechend, höchstens zwei Zeilen; Querformat (`@media (orientation: landscape)`): vertikale Spalte 52 px breit zwischen `#top` und `#stage`, `overflow-y:auto`; Buttons `min-width:40px; min-height:40px`, aktive Modi hervorgehoben, Safe Areas wie die übrigen Leisten; `#stage` behält `min-height:0`/`flex:1`.
- [ ] **Step 5: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 6: Verifikation im Browser** (Mobil Hoch- und Querformat, eigener Dev-Server): Leiste erscheint nur beim Werkzeug Auswahl; Modi +/− kombinieren zwei Rechtecke (Pixelzahl der Maske, Rahmen), Verschieben im Modus + nicht möglich; Alles, Aufheben; Kopieren → Frame/Ebene wechseln (Fenster setzt ab) → Einfügen → ✓ → Pixel dort; Ausschneiden, Löschen (ein Undo-Schritt jeweils); Spiegeln ↔ ↕ und ↻ am schwebenden Inhalt (Pixelposition prüfen); 4× ↻ = Ausgangsbild; Aktionen auf gesperrter/ausgeblendeter Ebene zeigen den Hinweis und ändern nichts; Leiste verdeckt in keinem Layout die Zeichenfläche und alle Buttons sind ≥ 40 px (Messung per `getBoundingClientRect`); kein Konsolenfehler.
- [ ] **Step 7: Commit** "Auswahl-Leiste: Modi und Aktionen".

---

### Abschluss

- [ ] Alle Tests und die Typprüfung laufen; `git status` ist sauber.
- [ ] Kein Push und kein `npm run deploy` ohne ausdrückliche Freigabe des Nutzers.
