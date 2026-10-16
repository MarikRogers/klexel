# Auswahl Teil 2 Implementation Plan (Lasso und Zauberstab)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Auswahl-Werkzeug bekommt zwei freie Formen: **Lasso** (Finger zeichnet einen Pfad, der sich zum Polygon schließt) und **Zauberstab** (zusammenhängende Fläche gleicher Farbe oder alle Pixel dieser Farbe auf der aktiven Ebene), beide kombinierbar mit den Modi Neu/Hinzufügen/Abziehen.

**Architecture:** `Selection` bekommt die Fabriken `polygon` und `region`; die Gesten in `main.ts` und die Leiste `#selbar` bekommen eine Formwahl und den Zauberstab-Umschalter. Verschieben, Zwischenablage, Spiegeln und Drehen aus Teil 1 gelten unverändert für jede Auswahlform.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest (Testumgebung `node`, kein DOM), Canvas 2D.

**Spec:** `docs/specs/2026-10-16-auswahl-design.md` (Abschnitt „Teil 2: Lasso und Zauberstab“)

**Voraussetzung:** Plan `docs/plans/2026-10-16-auswahl-teil1.md` ist umgesetzt und gemergt (`Selection`, `SelectionSession`, `#selbar`, `selMode`, `Viewport.selectionPreview`).

## Global Constraints

- Lasso: Pfad in Dokumentkoordinaten, aufeinanderfolgende Duplikate entfallen; beim Loslassen schließt sich der Pfad zum Polygon; Füllung per Even-Odd über **Pixelmitten** (Pixel `(x, y)` ist ausgewählt, wenn der Punkt `(x + 0.5, y + 0.5)` im Polygon liegt); weniger als 3 verschiedene Punkte → keine Auswahl; Punkte außerhalb der Fläche sind erlaubt, das Ergebnis wird auf die Fläche geklemmt.
- Zauberstab: liest die Pixel der **aktiven Ebene im aktuellen Frame** (nicht das Gesamtbild), eine fehlende Cel zählt als lauter `0` (transparente Fläche); `contiguous = true` → 4er-Nachbarschaft (ohne Diagonalen) um das angetippte Pixel, `false` → alle Pixel mit genau dieser Farbe auf der Ebene; exakte Farbe, keine Toleranz; Tippen außerhalb der Fläche ändert nichts.
- Beide Formen kombinieren nach dem Modus aus Teil 1 (`selMode`: `replace` / `add` / `subtract`) und setzen vorher ab; Verschieben der Auswahl (Zeiger in der Auswahl im Modus Neu) gilt für alle Formen gleich.
- Leiste: Formwahl **Rechteck / Lasso / Zauberstab** (Standard Rechteck), bei Zauberstab zusätzlich der Schalter **Alle Farben** (aus = zusammenhängend); Touch-Ziele ≥ 40 px, SVG-Icons `stroke-width="1.25"`, UI-Texte deutsch.
- Lasso-Vorschau als gestrichelte Linie des Pfads (`view.selectionPreview`, Variante `{ kind: 'path'; points: Array<[number, number]> }`), Rechteck-Vorschau bleibt `{ kind: 'rect', … }`.
- Bestehende Tests (aus Teil 1 und früher) bleiben grün; nach jedem Task laufen `npx tsc --noEmit` und `npx vitest run` ohne Fehler.

## Review Focus

- Entartete Lasso-Pfade (ein Punkt, zwei Punkte, alle Punkte auf einer Linie, sehr kurzer Pfad, Pfad komplett außerhalb der Fläche) erzeugen keine Auswahl und keinen Fehler (Task 1).
- Lasso mit Selbstüberschneidung folgt Even-Odd (Schleife bleibt ein Loch), konkave Formen füllen korrekt, Pfad teilweise außerhalb wird geklemmt (Task 1).
- Zauberstab auf leerer Cel (transparent), auf Fläche ohne Diagonalverbindung, an den Rändern der Fläche und außerhalb der Fläche; „Alle Farben“ nimmt nur Pixel der aktiven Ebene und des aktuellen Frames (Task 1).
- Lasso und Zauberstab in den Modi `add`/`subtract` kombinieren korrekt mit bestehender Auswahl; Verschieben nach Lasso-/Zauberstab-Auswahl lässt nur die ausgewählten Pixel schweben und lässt keinen offenen History-Strich zurück (Task 2).
- Gesten auf großen Flächen (128×128, Pfade mit hunderten Punkten) bleiben flüssig; keine Verzögerung beim Ziehen durch Neuberechnung der Maske bei jedem Pointermove (nur die Vorschau-Linie) (Task 2).

---

### Task 1: Polygon- und Regionsauswahl im Modell

**Files:**
- Modify: `src/model/Selection.ts`
- Create: `src/model/selectionFree.test.ts`

**Interfaces:**
- Consumes: `Selection` aus Teil 1 (`empty`, `rect`, `combine`, `count`, `contains`, `bounds`).
- Produces: `Selection.polygon(w: number, h: number, points: Array<[number, number]>): Selection` (Even-Odd über Pixelmitten, auf die Fläche geklemmt; weniger als 3 verschiedene Punkte → leer; Pfad wird implizit geschlossen); `Selection.region(w: number, h: number, pixels: Uint32Array | undefined, x: number, y: number, contiguous: boolean): Selection` (`pixels` = Cel der aktiven Ebene im aktuellen Frame oder `undefined` für leer; `(x, y)` außerhalb der Fläche → leer; Farbe des Startpixels als Referenz).

- [ ] **Step 1: Failing tests in `src/model/selectionFree.test.ts`:**
  - `polygon`: Quadrat `[[1,1],[5,1],[5,5],[1,5]]` in 8×8 → Pixel `(1..4, 1..4)` (`count() === 16`, `contains(4,4)` true, `contains(5,5)` false — Pixelmitten); Dreieck `[[0,0],[8,0],[0,8]]` in 8×8 → `contains(1,1)` true, `contains(7,7)` false, Symmetrie um die Diagonale; konkave L-Form (sechs Punkte) lässt die Einbuchtung frei; Selbstüberschneidung (Schleife, „Acht“): das Loch der Schleife ist **nicht** ausgewählt (Even-Odd); Pfad teilweise außerhalb (`[[−3,−3],[3,−3],[3,3],[−3,3]]` in 8×8) → `count() === 9`; komplett außerhalb → leer; entartet: `[]`, ein Punkt, zwei Punkte, drei gleiche Punkte, drei Punkte auf einer Linie → leer; aufeinanderfolgende Duplikate ändern das Ergebnis nicht; Ergebnis entspricht `rect` für achsenparallele Rechtecke mit ganzzahligen Ecken (`polygon` Quadrat = `rect(8, 8, 1, 1, 4, 4)`).
  - `region`: 4×4-Pixelfeld mit zwei getrennten Flächen gleicher Farbe `7` (eine Fläche links oben, eine rechts unten, nur diagonal verbunden → nicht zusammenhängend), Rest `0`: Tippen in die linke Fläche, `contiguous true` → nur diese Fläche (4er-Nachbarschaft: eine diagonale Verbindung zählt nicht); `contiguous false` → beide Flächen; Tippen auf `0`-Bereich wählt zusammenhängend nur dessen Teilfläche; `pixels = undefined` (leere Cel): Tippen wählt die **gesamte** Fläche (lauter `0`) bei `contiguous true`/`false`; Startpixel außerhalb der Fläche (`(-1, 0)`, `(0, 99)`) → leer; Fläche am Rand (Pixel bei `x = 0` und `x = w−1`) korrekt; Cel mit anderer Länge als `w*h` → `RangeError`.
- [ ] **Step 2: Run** `npx vitest run src/model/selectionFree.test.ts` → FAIL.
- [ ] **Step 3: Implement** `polygon` (Scanline Even-Odd über Pixelmitten, Duplikate entfernen, Mindestanzahl der verschiedenen Punkte prüfen, Ergebnis auf die Fläche klemmen) und `region` (iterativer Flood-Fill mit Stack wie in `src/tools/fill.ts`, bzw. lineare Suche für `contiguous = false`).
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 5: Commit** "Selection: Polygon (Lasso) und Region (Zauberstab)".

---

### Task 2: Gesten und Leiste für Lasso und Zauberstab

**Files:**
- Modify: `src/main.ts`, `src/render/Viewport.ts`, `src/ui/selectionBar.ts`, `src/ui/icons.ts` (Icons `lasso`, `wand`), `src/style.css`

**Interfaces:**
- Consumes: Task 1 (`Selection.polygon`, `Selection.region`), Teil 1 (`SelectionSession.select`, `selMode`, `selectionPreview`, `createSelectionBar`).
- Produces: in `main.ts` die Variablen `selShape: 'rect' | 'lasso' | 'wand'` (Standard `'rect'`) und `wandAll: boolean` (Standard `false`); `Viewport.selectionPreview` erweitert zu `{ kind: 'rect'; x0; y0; x1; y1 } | { kind: 'path'; points: Array<[number, number]> } | null`; `createSelectionBar` bekommt zusätzlich `getShape/setShape` und `getWandAll/setWandAll`.

- [ ] **Step 1: Leiste:** Formgruppe **Rechteck / Lasso / Zauberstab** (genau eine aktiv, Standard Rechteck) vor der Modus-Gruppe; bei Zauberstab zusätzlich der Schalter **Alle Farben** (aktiv = `wandAll`); Wechsel von Form oder Schalter setzt vorher ab (`session.commit()`), ohne die Maske zu ändern.
- [ ] **Step 2: Gesten (Werkzeug `select`):** der Verschiebe-Zweig aus Teil 1 gilt unverändert für alle Formen (Zeiger in der Auswahl im Modus Neu); außerhalb bzw. in den Modi `add`/`subtract`: **Lasso** sammelt Dokumentpixel-Punkte während des Ziehens (nur bei geändertem Pixel, Duplikate entfallen), `view.selectionPreview = { kind: 'path', points }`, beim Loslassen `session.select(Selection.polygon(doc.width, doc.height, points), selMode)` (weniger als 3 verschiedene Punkte → nichts; Tippen im Modus `replace` hebt weiterhin die Auswahl auf wie beim Rechteck); **Zauberstab** reagiert auf Tippen (Pointerup ohne Ziehen): `session.select(Selection.region(doc.width, doc.height, doc.cel(doc.activeId, doc.currentFrameId), x, y, !wandAll), selMode)`; Tippen außerhalb der Fläche macht nichts; zweiter Finger beendet die Lasso-Geste ohne Auswahl und lässt die Ansicht wie bisher zoomen/verschieben.
- [ ] **Step 3: Viewport:** `selectionPreview` vom Typ `path` zeichnet den Pfad als gestrichelte Linie (1 px schwarz, 1 px weiß gestrichelt darüber) über das Gesamtbild und schließt ihn mit einer dünnen Linie zum Startpunkt; Rechteck-Vorschau unverändert.
- [ ] **Step 4: Run** `npx tsc --noEmit`, `npx vitest run` → grün.
- [ ] **Step 5: Verifikation im Browser** (Mobil Hoch- und Querformat, eigener Dev-Server auf freiem Port, nur diesen stoppen, nie alle `node.exe`): Lasso mit mehreren Punkten ziehen → Vorschau-Linie, beim Loslassen Rahmen um die Fläche (Pixelzahl der Maske per `javascript_tool`/Rahmen-Check), Lasso mit Schleife (Acht) lässt das Loch frei; Lasso im Modus `add` erweitert, im Modus `subtract` zieht ab; Zauberstab auf einer Fläche mit zwei getrennten Farbflächen: zusammenhängend wählt nur die angetippte, „Alle Farben“ beide; Zauberstab auf transparenter Fläche wählt die ganze transparente Fläche; Verschieben nach Lasso-/Zauberstab-Auswahl lässt nur diese Pixel schweben (Loch an der Quelle), Absetzen/Undo wie in Teil 1 ein Schritt; Kopieren/Einfügen/Spiegeln/Drehen funktionieren mit der freien Form; Zauberstab liest die aktive Ebene (zweite Ebene mit anderen Pixeln: nur deren Fläche); Tippen außerhalb der Fläche ändert nichts; Formwechsel setzt ab; gesperrte Ebene: Auswählen geht, Verschieben zeigt den Hinweis; kein Konsolenfehler; Zeichenfläche bleibt flüssig (Pfad mit mehreren hundert Punkten).
- [ ] **Step 6: Commit** "Auswahl: Lasso und Zauberstab".

---

### Abschluss

- [ ] Alle Tests und die Typprüfung laufen; `git status` ist sauber.
- [ ] Kein Push und kein `npm run deploy` ohne ausdrückliche Freigabe des Nutzers.
