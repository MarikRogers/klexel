# Auswahl skalieren Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Auswahl lässt sich über acht Griffe (vier Ecken proportional, vier Kantenbalken einachsig) mit dem Finger größer und kleiner ziehen; Verkleinern mittelt wie beim Foto-Import und bildet auf die Farben der Auswahl ab, Vergrößern bleibt scharf.

**Architecture:** Reine Funktionen in `src/edit/` (`scaleFloating`, `resizeBox`, Griff-Geometrie) liefern Pixel, Rechteck und Trefferprüfung. `SelectionSession` bekommt `beginScale`/`scaleTo`/`restoreScale`, die auf der schwebenden Auswahl arbeiten (Anheben wie beim Verschieben). `main.ts` verdrahtet eine neue Geste `'scale'` in `selGesture`, `Viewport` zeichnet Griffe und Größenanzeige.

**Tech Stack:** TypeScript, Vite, Vitest (Node, ohne DOM), keine neuen Abhängigkeiten.

**Spec:** `../specs/2026-10-18-auswahl-skalieren-design.md`

## Global Constraints

- Acht Griffe um das umschließende Rechteck: Ecken `nw ne se sw` (rund, proportional skalierend, gegenüberliegende Ecke fest), Kantenbalken `n e s w` (einachsig, gegenüberliegende Kante fest). Ecken haben Vorrang vor Balken, alle Griffe vor Verschieben und neuer Auswahl.
- Griffe liegen **außerhalb** des Rechtecks; Touchfläche mindestens **44 × 44** Bildschirmpixel (Querformat **40**); Zonen und Darstellung ragen nie ins Rechteck. Größe der Griffe unabhängig vom Zoom.
- Größen ganze Pixel, **mindestens 1 × 1, höchstens 128 pro Seite** (`MAX_SIZE`, `src/model/Document.ts`).
- Skalieren: je Achse Vergrößern (oder gleich) = Nächster Nachbar (scharf), Verkleinern = Flächenmittel alpha-gewichtet. Wird mindestens eine Achse kleiner: Farben auf die **Farben der Quelle** abbilden (`quantize(pixels, w, h, palette, 'none', false)` aus `src/photo/quantize.ts`; Palette = verschiedene RGB-Werte der Pixel mit Alpha ≥ 128 und Maske, Reihenfolge des ersten Auftretens); **mehr als 256** Farben → keine Abbildung, nur die Alpha-Regel (Alpha < 128 → 0, sonst 255). Reines Vergrößern lässt Farben und Alpha unverändert. Maske: Zielpixel ausgewählt, wenn mindestens die Hälfte der Quellfläche ausgewählt war.
- Jedes Ziehen rechnet aus dem Zustand **zu Beginn des Ziehens** (`base`); Abbruch (zweiter Finger, Werkzeugwechsel) stellt `base` wieder her; Skalieren erzeugt keinen eigenen Undo-Schritt, erst Absetzen (ein Schritt, `SelectionSession.commit`).
- Gesperrte oder ausgeblendete Ebene: Hinweis „Ebene gesperrt" bzw. „Ebene ausgeblendet", keine Änderung. Größenanzeige während des Ziehens: Text `"<w>×<h>"`.
- Tests: `npm test` im Ordner `D:\source\repos\klexel`; Typprüfung `npm run build`. Branch `feature/auswahl-skalieren`.

## Review Focus

- Winzige Auswahlen (1×1, 2×2): alle Griffzonen liegen außerhalb des Rechtecks, das Innere bleibt zum Verschieben greifbar, Ecken gewinnen gegen überlappende Balken. → Task 3.
- Hin- und Herziehen innerhalb einer Geste verliert nichts: Rückkehr zur Ausgangsgröße ergibt exakt die Quelle. → Task 4.
- Abbruch mitten im Ziehen (zweiter Finger, Werkzeugwechsel, gesperrte Ebene): keine halb skalierte Auswahl, keine History-Reste, Auswahl und Maske wie vorher. → Task 4, Task 5.
- Quelle mit mehr als 256 Farben, Ziel 1×1 und 128×128, Auswahl mit transparenten Pixeln und Lassomaske: kein Absturz, Maske bleibt formtreu. → Task 1.
- Zoom und Verschieben: Griffe bleiben in fester Bildschirmgröße und an der richtigen Stelle, auch bei Auswahl am Rand der Fläche. → Task 3, Task 5.

---

### Task 1: Pixel skalieren

**Files:**
- Create: `src/edit/scale.ts`
- Test: `src/edit/scale.test.ts`

**Interfaces:**
- Consumes: `Floating` (`src/edit/SelectionSession.ts`: `{ pixels: Uint32Array; mask: Uint8Array; w; h; x; y }`), `quantize` (`src/photo/quantize.ts`), `MAX_SIZE`.
- Produces: `MAX_SCALE_COLORS = 256`; `scaleFloating(base: Floating, newW: number, newH: number): { pixels: Uint32Array; mask: Uint8Array }` (Größe `newW × newH`, Eingaben `1..MAX_SIZE`, wirft sonst `RangeError`).

- [ ] **Step 1: Tests schreiben** (kleine Hilfsfunktion baut eine `Floating` aus einem Textmuster, Farben als `0xRRGGBBAA`): Verdoppeln einer 2×2 wiederholt jedes Pixel genau 2×2; 3 → 5 enthält nur Quellfarben und verteilt die Rundung gleichmäßig (jede Quellspalte kommt 1- oder 2-mal vor); Verkleinern 4×4 mit zwei Farben (Schachbrett) enthält nur diese zwei Farben und Transparenz, nie eine Mischfarbe; Verkleinern liefert für eine Fläche aus Rot und Grün im Verhältnis 3:1 die häufigere Farbe; gemischte Achsen (breiter, niedriger) sind auf der vergrößerten Achse scharf (keine Mischfarbe entlang dieser Achse); Quelle mit 300 verschiedenen Farben wird beim Verkleinern **nicht** abgebildet (es erscheint mindestens eine Farbe, die in der Quelle nicht vorkommt) und hat danach nur Alpha 0 oder 255; halbtransparentes Pixel (Alpha 100) wird beim Verkleinern transparent, Alpha 200 deckend (255); reines Vergrößern lässt Alpha 128 unverändert; gleiche Zielgröße liefert dieselben Pixel; Ziel 1×1 und Ziel 128×128 laufen durch; Lassomaske (Dreieck) bleibt beim Vergrößern formtreu und gilt beim Verkleinern nach der Hälfte-Regel; Pixel ohne Maske werden zu 0; `scaleFloating(base, 0, 5)` und `(base, 129, 5)` werfen `RangeError`.
- [ ] **Step 2:** `npx vitest run src/edit/scale.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren** `scaleFloating` in `src/edit/scale.ts`: je Achse eine Gewichtsliste `Array<Array<[index, weight]>>` (Vergrößern/gleich: ein Quellindex `floor((o + 0.5) * src / dst)` mit Gewicht 1; Verkleinern: Flächenanteile der überdeckten Quellpixel); Zielpixel = alpha-gewichtetes Mittel über das Produkt beider Listen (Maske 0 zählt als Alpha 0, Maskenabdeckung = Summe der Gewichte mit Maske 1 geteilt durch die Gesamtfläche, Schwelle ≥ 0,5); `boxResize` aus `src/photo/resize.ts` nicht wiederverwenden (kann Vergrößern nicht scharf). Nach dem Mitteln: wenn eine Achse kleiner wurde, Palette bilden und `quantize` aufrufen, bei > 256 Farben nur die Alpha-Regel; sonst unverändert lassen.
- [ ] **Step 4:** Test erneut → PASS.
- [ ] **Step 5: Branch-Dokumente und Task committen:** erst `git add docs/specs/2026-10-18-auswahl-skalieren-design.md docs/plans/2026-10-18-auswahl-skalieren.md` und `docs: Spec und Plan für Auswahl skalieren`, dann `src/edit/scale*` mit `feat: Auswahl skalieren, Pixelberechnung`.

### Task 2: Rechteck beim Ziehen

**Files:**
- Create: `src/edit/resizeBox.ts`
- Test: `src/edit/resizeBox.test.ts`

**Interfaces:**
- Consumes: `MAX_SIZE`.
- Produces: `type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'`; `interface Box { x: number; y: number; w: number; h: number }`; `resizeBox(handle: HandleId, start: Box, dx: number, dy: number): Box` — `dx`, `dy` Fingerverschiebung seit Beginn in Dokumentpixeln (darf gebrochen sein); Ergebnis ganze Zahlen, `1 ≤ w, h ≤ 128`, gegenüberliegende Ecke bzw. Kante fest.

- [ ] **Step 1: Tests schreiben:** für jede der vier Ecken bei Start `{x:10,y:10,w:20,h:10}`: Ziehen nach außen um `(+10, +5)` ergibt proportional `{w:30,h:15}` (Faktor aus der größeren Achsenänderung), gegenüberliegende Ecke bleibt auf derselben Position (Koordinaten der Gegenecke vor und nach gleich); der größere der beiden Faktoren gewinnt (Ziehen `(+2, +9)` an `se` ergibt Faktor aus `h`); für jeden Balken ändert sich nur eine Achse und die Gegenkante bleibt (`e`: `x` fest, `w + dx`; `w`: rechte Kante fest; `s`, `n` analog); Ziehen über die Gegenseite hinaus hält die kleinste proportionale Größe (`se` mit `(-100, -100)` bei Start `20×10` ergibt `{ w: 2, h: 1 }`; ein Balken ergibt `1` auf seiner Achse), nie 0 oder negativ; Obergrenze 128 je Seite (proportional so, dass keine Seite über 128 geht); gebrochene Eingaben werden auf ganze Pixel gerundet; `dx = dy = 0` liefert den Startwert.
- [ ] **Step 2:** `npx vitest run src/edit/resizeBox.test.ts` → FAIL.
- [ ] **Step 3: Implementieren** `resizeBox` (Ecke: `s = max(newW / w, newH / h)`, `s` auf `[max(1/w, 1/h), min(128/w, 128/h)]` begrenzen, `w' = max(1, round(w·s))`, `h'` ebenso; Position so, dass die Gegenecke fest bleibt).
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `feat: Rechteck beim Skalieren durch Ziehen`.

### Task 3: Griff-Geometrie und Trefferprüfung

**Files:**
- Create: `src/edit/handles.ts`
- Test: `src/edit/handles.test.ts`

**Interfaces:**
- Consumes: `HandleId` (Task 2).
- Produces: `interface ScreenRect { x: number; y: number; w: number; h: number }`; `interface HandleGeom { id: HandleId; kind: 'corner' | 'bar'; cx: number; cy: number; zone: ScreenRect }` (`cx`/`cy` Mitte der sichtbaren Form, `zone` die Touchfläche); `handleLayout(box: ScreenRect, view: { width: number; height: number }, touch?: number): HandleGeom[]` (acht Einträge, `touch` Standard 44); `hitHandle(handles: HandleGeom[], x: number, y: number): HandleId | null`; Konstanten `HANDLE_CORNER_PX = 20`, `HANDLE_BAR_LONG_PX = 40`, `HANDLE_BAR_SHORT_PX = 8`.

- [ ] **Step 1: Tests schreiben:** acht Griffe mit allen acht Ids; bei großem Rechteck mitten in der Fläche hat jede Zone `touch × touch` (44 und 40), liegt vollständig außerhalb des Rechtecks (kein Schnitt mit dem Inneren) und `cx`/`cy` liegen in der Zone; Ecke `nw` liegt links oben außerhalb, Balken `n` über der Mitte der oberen Kante; **winziges Rechteck** (z. B. 8×8 und 1×1 Bildschirmpixel) — keine Zone schneidet das Rechteck; Punkt in der Mitte des Rechtecks trifft keinen Griff (`null`); Überlappung von Ecke und Balken bei kleinem Rechteck: ein Punkt in beiden Zonen liefert die Ecke; Rechteck an den Rand der Fläche geschoben (`x = 0`): Zone des Balkens `w` wird auf den sichtbaren Bereich begrenzt und am Rechteck abgeschnitten (dadurch nie im Inneren, darf kleiner als 44 sein, bei Breite 0 nicht treffbar); Rechteck weit außerhalb der Fläche: keine Ausnahme; Querformat (`touch = 40`).
- [ ] **Step 2:** `npx vitest run src/edit/handles.test.ts` → FAIL.
- [ ] **Step 3: Implementieren** (Zonen: Ecke außen diagonal anliegend, Balken mittig an der Außenseite; danach auf `[0, view.width] × [0, view.height]` begrenzen und mit dem Rechteck abziehen; `hitHandle`: zuerst Ecken, bei mehreren die mit dem nächsten `cx/cy`, dann Balken).
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `feat: Griffe der Auswahl, Lage und Treffer`.

### Task 4: `SelectionSession` skaliert

**Files:**
- Modify: `src/edit/SelectionSession.ts`
- Test: `src/edit/sessionScale.test.ts` (neu, nach dem Muster von `sessionCore.test.ts`)

**Interfaces:**
- Consumes: `scaleFloating` (Task 1), `Box` (Task 2), `lift`, `commit`, `cancel` der Session.
- Produces: `SelectionSession.beginScale(): { reason: LiftResult; base: Floating | null }` — hebt bei Bedarf an (wie `moveBy`), liefert bei `reason === 'ok'` eine **Kopie** der schwebenden Auswahl als `base`; `scaleTo(base: Floating, box: Box): void` — ersetzt die schwebende Auswahl durch `scaleFloating(base, box.w, box.h)` an Position `box.x`, `box.y`; `restoreScale(base: Floating): void` — stellt `base` als schwebende Auswahl wieder her.

- [ ] **Step 1: Tests schreiben** (echte `PixelDocument`, `History`, `Selection.rect`): `beginScale` hebt an und liefert `base` mit Größe der Auswahl; `scaleTo` auf das Doppelte ändert `floating.w/h` und die Maske, `session.selection` hat danach das neue Rechteck; `commit` legt das skalierte Bild ins Dokument und erzeugt **einen** Undo-Schritt (ein `history.undo()` stellt das Original wieder her, danach ist `canUndo` false); **Hin- und Herziehen:** `scaleTo(base, groß)` dann `scaleTo(base, Ausgangsgröße)` ergibt Pixel und Maske exakt wie `base`; zweimal skalieren rechnet jeweils aus `base`; `restoreScale(base)` bringt Größe, Position, Pixel zurück und `cancel()` stellt danach das Bild wieder her; gesperrte Ebene: `beginScale` liefert `{ reason: 'locked', base: null }` und ändert nichts, ausgeblendete ebenso; ohne Auswahl `{ reason: 'none', base: null }`; Skalieren einer bereits schwebenden (verschobenen) Auswahl nimmt die schwebende als `base`.
- [ ] **Step 2:** `npx vitest run src/edit/sessionScale.test.ts` → FAIL.
- [ ] **Step 3: Implementieren** die drei Methoden in `SelectionSession` (nutzen `lift()`, setzen `placed = null` wie `transform`).
- [ ] **Step 4:** `npx vitest run src/edit` → PASS (auch die bestehenden Auswahl-Tests).
- [ ] **Step 5: Commit** `feat: SelectionSession skaliert die schwebende Auswahl`.

### Task 5: Einbau in die App

**Files:**
- Modify: `src/render/Viewport.ts`, `src/main.ts`, `docs/ideen/2026-10-18-roadmap.md`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `Viewport.scaleHandles: HandleGeom[] | null` und `Viewport.scaleLabel: { x: number; y: number; text: string } | null` (Bildschirmkoordinaten, werden in `render()` nach der Auswahlkontur gezeichnet: Ecken als weiße Kreise mit schwarzer Kontur, Durchmesser `HANDLE_CORNER_PX`; Balken als abgerundete weiße Rechtecke `HANDLE_BAR_LONG_PX × HANDLE_BAR_SHORT_PX` mit schwarzer Kontur, an Kante passend gedreht; Größenanzeige als dunkle Kapsel mit weißem Text).

- [ ] **Step 1: `Viewport` erweitern** (Felder und Zeichnen, siehe Interfaces).
- [ ] **Step 2: `main.ts`: Geste `'scale'`.** In `selGesture` kommt die Art `{ kind: 'scale'; handle: HandleId; start: Box; base: Floating; sx: number; sy: number }` hinzu (`sx`, `sy` Bildschirmposition beim Aufsetzen). `selectionDown`: bei `tool === 'select'` und `session.hasSelection` die Griffe aus dem Auswahlrechteck bestimmen (Rechteck der schwebenden Auswahl, sonst `session.selection.bounds()`, umgerechnet mit `view.panX/panY/zoom`), `hitHandle` prüfen; bei Treffer `session.beginScale()` — bei `reason !== 'ok'` Hinweis wie beim Verschieben (`'Ebene gesperrt'`/`'Ebene ausgeblendet'`) und Abbruch, sonst `selGesture = { kind: 'scale', ... }` mit `start` = Rechteck zu Beginn. `selectionMove`: `dx = (sx' - sx) / view.zoom`, `dy` ebenso, `session.scaleTo(base, resizeBox(handle, start, dx, dy))`, Größenanzeige setzen. `selectionUp`: Geste beenden (Auswahl bleibt schwebend, Anzeige weg). `cancelSelGesture`: bei `'scale'` `session.restoreScale(base)`. Der Zwei-Finger-Zweig und die Werkzeug-Buttons rufen bereits `cancelSelGesture()` auf.
- [ ] **Step 3: `refresh()`:** `view.scaleHandles` mit `handleLayout(...)` füllen, wenn `tool === 'select'` und `session.hasSelection`, sonst `null`; `touch` = 40 bei `matchMedia('(orientation: landscape)').matches`, sonst 44; `view.scaleLabel` nur während einer Skalier-Geste.
- [ ] **Step 4: `npm test` und `npm run build`** fehlerfrei.
- [ ] **Step 5: Von Hand prüfen** (`npm run dev`, Browser mit Geräteemulation Handy, Hoch- und Querformat): Griffe erscheinen bei jeder Auswahl (Rechteck, Lasso, Zauberstab) und verschwinden bei anderem Werkzeug; Ecke zieht proportional, Balken einachsig, jeweils mit fester Gegenseite; Vorschau live mit Größenanzeige; Verkleinern erzeugt keine neuen Farben; Vergrößern scharf; Hin- und Herziehen in einer Geste verliert nichts; zweiter Finger bricht ab und zoomt; Werkzeugwechsel mitten im Ziehen bricht ab; Absetzen legt ein, ein Undo nimmt alles zurück; gesperrte Ebene zeigt Hinweis; winzige Auswahl (1×1) bleibt verschiebbar; Griffe bleiben bei Zoom gleich groß und an der richtigen Stelle; Auswahl am Rand der Fläche.
- [ ] **Step 6: Roadmap:** in `docs/ideen/2026-10-18-roadmap.md` unter „Stand" einen Vermerk „Auswahl skalieren (Griffe, Pixelreduzierung auf Auswahlfarben) umgesetzt" ergänzen.
- [ ] **Step 7: Commit** `feat: Auswahl skalieren in der App`.
