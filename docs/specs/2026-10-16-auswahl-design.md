# Auswahl – Design

Stand: 2026-10-16 · Projekt: Pixelart-PWA (`D:\source\docs\pixelart`, veröffentlicht als klexel) · baut auf den Specs zu Ebenen und Animation auf (`2026-10-16-ebenen-design.md`, `2026-10-16-animation-design.md`)

## Ziel

Die App bekommt eine Auswahl: Bereiche markieren, verschieben, kopieren, ausschneiden, einfügen, löschen, spiegeln und drehen, später auch per Lasso und Zauberstab. Sie bleibt ein persönliches, mobiles Zeichenwerkzeug ohne Konto und Cloud. Erfolg heißt: Man kann einen Bereich mit dem Finger markieren, ihn schwebend verschieben, auf eine andere Ebene oder in einen anderen Frame übertragen, spiegeln und drehen, und jede Änderung ist ein einziger Undo-Schritt.

Entschieden (vom Nutzer): Funktionsumfang = Rechteck-Auswahl und Verschieben, Kopieren/Ausschneiden/Einfügen/Löschen, Spiegeln und Drehen, freie Auswahl (Lasso und Zauberstab). Aufteilung: **eine Spec, zwei Pläne** — Plan 1: Rechteck, Modi, Verschieben, Kopieren/Ausschneiden/Einfügen/Löschen, Spiegeln/Drehen, Auswahl-Leiste; Plan 2: Lasso und Zauberstab. Verschieben **schwebend bis zum Absetzen**. Zauberstab: zusammenhängend, exakte Farbe, aktive Ebene, mit Umschalter „alle gleichen Farben“, ohne Toleranz. Modi **Neu / Hinzufügen / Abziehen** für alle Auswahlformen. Bedienung über **eine Auswahl-Leiste**, die bei aktivem Werkzeug erscheint.

Annahmen (vom Nutzer bestätigt): Die Auswahl wird nicht gespeichert und ihre Änderungen sind nicht Teil von Undo; die Zwischenablage lebt nur in der App; Einfügen platziert in der Mitte des sichtbaren Bereichs; Drehen um die Mitte der Grenzen; Absetzen blendet teiltransparente Pixel ein.

Nicht Teil dieser Spec: Systemzwischenablage, Auswahl über mehrere Ebenen oder Frames gleichzeitig, Toleranz beim Zauberstab, Zeichnen nur innerhalb der Auswahl (Clipping für andere Werkzeuge), Skalieren/freies Drehen, Undo für reine Auswahländerungen, Tastaturkürzel.

## Teile

- **Teil 1 (Plan 1):** Modell `Selection`, Sitzung mit schwebendem Inhalt, Rechteck-Auswahl, Modi, Verschieben, Kopieren/Ausschneiden/Einfügen/Löschen, Alles/Aufheben, Spiegeln, Drehen, Auswahl-Leiste, Darstellung.
- **Teil 2 (Plan 2):** Lasso (`Selection.polygon`), Zauberstab (`Selection.region`), Formwahl und Zauberstab-Umschalter in der Leiste.

## Modell (`src/model/Selection.ts`, reine Logik ohne DOM)

```ts
class Selection {
  readonly width: number; readonly height: number;      // Dokumentgröße
  readonly mask: Uint8Array;                            // width*height, 1 = ausgewählt
  static empty(w: number, h: number): Selection;
  static rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Selection; // beide Ecken inklusive, auf die Fläche geklemmt
  static all(w: number, h: number): Selection;
  combine(other: Selection, mode: 'replace' | 'add' | 'subtract'): Selection;   // neue Auswahl, ändert nichts
  isEmpty(): boolean;
  count(): number;
  contains(x: number, y: number): boolean;              // außerhalb = false
  bounds(): { x: number; y: number; w: number; h: number } | null;  // null bei leer
  translated(dx: number, dy: number): Selection;        // verschoben, Rand abgeschnitten
  edges(): Array<{ x: number; y: number; dir: 'h' | 'v' }>;          // Kanten zwischen Pixeln innerhalb/außerhalb (für den Rahmen)
}
```

- Teil 2 ergänzt `Selection.polygon(w, h, points)` (Even-Odd über Pixelmitten, Punkte in Dokumentkoordinaten) und `Selection.region(w, h, pixels: Uint32Array | undefined, x, y, contiguous: boolean)` (4er-Nachbarschaft bzw. alle Pixel gleicher Farbe; `undefined` = leere Cel = alle `0`).
- Eine leere Maske nach `combine` zählt als „keine Auswahl“.

## Sitzung (`src/edit/SelectionSession.ts`)

Eine Sitzung pro App hält Auswahl, schwebenden Inhalt und Zwischenablage; sie benutzt `PixelDocument` und `History` über Abhängigkeiten (kein DOM).

```ts
interface Floating { pixels: Uint32Array; mask: Uint8Array; w: number; h: number; x: number; y: number }  // Pixel/Maske in Größe der Grenzen, (x, y) = Position der oberen linken Ecke im Dokument
interface Clip { pixels: Uint32Array; mask: Uint8Array; w: number; h: number }
class SelectionSession {
  constructor(getDoc: () => PixelDocument, getHistory: () => History);
  readonly selection: Selection | null;   readonly floating: Floating | null;   readonly clip: Clip | null;
  get hasSelection(): boolean;  get isFloating(): boolean;
  select(shape: Selection, mode: 'replace' | 'add' | 'subtract'): void;   // setzt vorher ab
  selectAll(): void;
  deselect(): void;                       // setzt ab, entfernt die Maske
  hitTest(x: number, y: number): boolean; // liegt (x, y) in der Auswahl bzw. im schwebenden Inhalt?
  lift(): boolean;                        // false, wenn blockiert (gesperrt/ausgeblendet) oder keine Auswahl
  moveBy(dx: number, dy: number): void;   // hebt bei Bedarf selbst an
  commit(): void;                         // setzt ab (ein Undo-Schritt), Maske folgt dem Inhalt
  cancel(): void;                         // verwirft das Schweben, stellt die Ebene wieder her
  flip(axis: 'h' | 'v'): boolean;   rotate90(): boolean;
  copy(): boolean;   cut(): boolean;   delete(): boolean;
  paste(centerX: number, centerY: number): boolean;
  reset(): void;                          // neues Dokument: Maske und Schweben verwerfen, Zwischenablage bleibt
}
```

### Ablauf und Regeln

- **Anheben (`lift`)** — nur wenn eine Auswahl existiert und `doc.drawBlockReason()` `null` ist: `history.begin()` (merkt Ebene und Frame der aktiven Ebene im aktuellen Frame), die ausgewählten Pixel werden in `Floating` kopiert (Pixel außerhalb der Maske `0`) und in der Cel mit `history.set(x, y, 0)` gelöscht; der Strich bleibt **offen**, bis zum Absetzen oder Abbrechen. Eine fehlende Cel ergibt einen vollständig transparenten schwebenden Inhalt, ohne Cel anzulegen.
- **Verschieben (`moveBy`)** ändert nur `floating.x/y`, nie die Ebene.
- **Absetzen (`commit`):** für jedes Pixel des schwebenden Inhalts mit Maske=1 und Alpha > 0 wird `blendOver(ziel, pixel, 100)` über `history.set` geschrieben (Alpha 255 ersetzt; teiltransparent blendet; Alpha 0 lässt das Ziel unberührt), Pixel außerhalb der Fläche entfallen; danach `history.commit()` — **ein Undo-Schritt** für Anheben, alle Verschiebungen, Spiegeln, Drehen und Absetzen. Die Maske wird mit dem Inhalt verschoben (`translated`, auf die Fläche abgeschnitten); `floating = null`.
- **Abbrechen (`cancel`):** `history.cancel()` stellt die Ebene her; die Maske kehrt zur Position vor dem Anheben zurück.
- **Spiegeln / Drehen:** heben bei Bedarf selbst an (`false` bei Blockade oder ohne Auswahl). `flip('h')`/`flip('v')` spiegeln Pixel und Maske in den Grenzen; `rotate90()` dreht im Uhrzeigersinn: Pixel `(i, j)` → `(h − 1 − j, i)` (neue Breite `h`, neue Höhe `w`), der Mittelpunkt bleibt (bei ungerader Differenz bis auf eine halbe Pixelbreite): `x' = x + trunc((w − h) / 2)`, `y' = y + trunc((h − w) / 2)` (`trunc` = Rundung gegen null, damit vier Drehungen exakt zur Ausgangsposition zurückführen). Pixel, die dadurch über den Rand ragen, bleiben schwebend und werden beim Absetzen abgeschnitten.
- **Kopieren:** schneidet die ausgewählten Pixel (schwebend: der schwebende Inhalt; sonst die aktive Ebene im aktuellen Frame) zu einem `Clip` in der Größe der Grenzen; immer erlaubt. **Ausschneiden** = Kopieren und Löschen; **Löschen** setzt die ausgewählten Pixel auf `0` als ein Undo-Schritt (`begin/set/commit`); schwebend: der schwebende Inhalt wird verworfen, die Quellpixel bleiben gelöscht (ein Schritt, `history.commit()`), die Maske bleibt an der aktuellen Position. Ausschneiden, Löschen, Spiegeln, Drehen, Verschieben auf einer gesperrten oder ausgeblendeten Ebene sind blockiert (`drawBlockReason`), Auswählen und Kopieren nicht.
- **Einfügen (`paste`):** nur mit Zwischenablage und wenn `drawBlockReason()` `null` ist; setzt vorher ab; `history.begin()` ohne Pixeländerung, der Clip wird schwebend an `x = round(centerX − w/2)`, `y = round(centerY − h/2)` platziert (auf der aktiven Ebene im aktuellen Frame); die Auswahl entspricht der Clip-Maske an dieser Position.
- **Auswahlen kombinieren (`select`):** setzt ab, dann `combine(neue, mode)`; Ergebnis leer → keine Auswahl. Auswahlen sind position-, nicht ebenenbezogen: Wechsel von Ebene oder Frame **setzt ab**, die Maske bleibt (so lässt sich kopieren, Frame wechseln und einfügen).
- **Undo/Redo bei Schweben:** der Undo-Button ruft `cancel()` (statt `history.undo()`); Redo ist währenddessen deaktiviert. Ohne Schweben verhalten sie sich wie bisher.
- **Setzen ab bei:** Öffnen eines Fensters (Ebenen, Frames), Wechsel von Ebene, Frame oder Werkzeug, Hinzufügen/Löschen/Verschieben von Ebenen und Frames, Wechsel der Seite in den Hintergrund (`visibilitychange` → `hidden`). Werkzeugwechsel entfernt zusätzlich die Maske (`deselect`). Das ersetzt für das Schweben das bisherige Verwerfen von `discardStroke` — Striche und Formen werden weiterhin verworfen.
- **Autosave:** während des Schwebens wird nicht gespeichert (der Zwischenzustand hat ein „Loch“); `commit`/`cancel` lösen den Autosave aus.
- **`reset()`** bei „Neu“, Import und jedem Wechsel des Dokuments; die Zwischenablage bleibt erhalten und lässt sich in ein anderes Dokument einfügen (abgeschnitten, wenn sie nicht passt).

### Anpassungen an `History`
- `History` bekommt für die Sitzung nur einen kleinen Zusatz: `get strokeOpen(): boolean` (es gibt einen offenen Strich). Das Verhalten von `begin/set/commit/cancel` bleibt unverändert. Alle anderen History-Aktionen (Ebenen, Frames, `commitProps`, Undo/Redo) dürfen bei offenem Strich nicht aufgerufen werden; die Oberfläche setzt vorher ab bzw. bricht ab (siehe „Setzen ab bei“ und „Undo/Redo bei Schweben“).

## Bedienung (`src/main.ts`, Teil 1)

- Neuer Button **Auswahl** (Icon: gestricheltes Rechteck, SVG, `stroke-width="1.25"`) in der Werkzeugleiste, `data-tool="select"`.
- **Gesten bei aktivem Werkzeug:**
  - Modus **Neu**: Zeiger *in* der Auswahl (`hitTest`) ziehen = verschieben (beim ersten Bewegen heben, dann `moveBy` mit dem Dokumentpixel-Versatz seit dem letzten Ereignis); Zeiger *außerhalb* ziehen = neue Rechteck-Auswahl (Vorschau als Rahmen während des Ziehens, beim Loslassen `select(rect, 'replace')`); Tippen ohne Ziehen außerhalb hebt die Auswahl auf (`deselect`).
  - Modus **Hinzufügen / Abziehen**: Ziehen erzeugt immer ein Rechteck, das mit der Auswahl kombiniert wird (kein Verschieben).
  - Ein zweiter Finger beendet die laufende Geste (der Inhalt bleibt, wo er ist) und zoomt/verschiebt die Ansicht wie bisher.
  - Das Anheben ist bei gesperrter/ausgeblendeter Ebene blockiert: Hinweis ("Ebene gesperrt" / "Ebene ausgeblendet"), kein Schritt.
- **Auswahl-Leiste** (`#selbar`), sichtbar nur bei aktivem Werkzeug **Auswahl**:
  - Modus-Gruppe: **Neu**, **+**, **−** (genau einer aktiv; Standard Neu).
  - Aktionen: **Alles**, **Aufheben**, **Kopieren**, **Ausschneiden**, **Einfügen**, **Löschen**, **↔** (horizontal spiegeln), **↕** (vertikal spiegeln), **↻** (90° drehen), **✓ Absetzen** (nur sichtbar, solange etwas schwebt).
  - Aktivierung: Aufheben/Kopieren/Ausschneiden/Löschen/Spiegeln/Drehen nur mit Auswahl; Einfügen nur mit Zwischenablage; blockierende Aktionen zeigen bei gesperrter/ausgeblendeter Ebene den Hinweis (Button bleibt antippbar, `aria-disabled`).
  - Layout: **Hochformat** in der Spaltenfolge zwischen Zeichenfläche und Werkzeugleiste, bis zu zwei Zeilen (nicht überlappend); **Querformat** als vertikale Spalte zwischen linker Leiste und Zeichenfläche, 52 px breit, scrollt. Touch-Ziele mindestens 40 px, Safe Areas beachtet, UI-Texte deutsch.
  - Einfügen nutzt als Mitte den Mittelpunkt der sichtbaren Zeichenfläche (`viewport.toDoc` des Canvas-Zentrums), auf die Dokumentfläche geklemmt.
- **Darstellung (`Viewport`):** `selectionOverlay: { edges: Array<{x, y, dir}>, floating: Floating | null } | null`. Schwebende Pixel werden über dem Gesamtbild gezeichnet (volle Deckkraft ihres Alphas, an `floating.x/y`), der Rahmen entlang der Maskenkanten (1 px schwarz, darüber 1 px weiß gestrichelt, statisch), beides vor Raster und Form-Vorschau; die Zeichenfläche zeigt die Ebene mit dem „Loch“, weil `lift` die Quellpixel in der Ebene löscht.
- **Rechteck-Geste** zeigt als Vorschau einen gestrichelten Rahmen (`view.preview`-ähnliches, getrenntes Feld `selectionPreview`), nicht die Pixel.

## Teil 2: Lasso und Zauberstab

- Formwahl in der Leiste: **Rechteck / Lasso / Zauberstab** (Standard Rechteck); der Zauberstab hat zusätzlich den Schalter **Alle Farben** (aus = zusammenhängend, an = alle Pixel dieser Farbe auf der aktiven Ebene).
- **Lasso:** Finger ziehen zeichnet einen Pfad (Dokumentkoordinaten, aufeinanderfolgende Duplikate entfallen); Vorschau als gestrichelte Linie, beim Loslassen schließt sich der Pfad zum Polygon → `Selection.polygon`, kombiniert nach Modus; weniger als 3 verschiedene Punkte ergeben keine Auswahl.
- **Zauberstab:** Tippen → `Selection.region` auf den Pixeln der aktiven Ebene im aktuellen Frame (4er-Nachbarschaft; eine leere Cel zählt als lauter `0`, also transparente Fläche), kombiniert nach Modus. Tippen außerhalb der Fläche macht nichts.
- Verschieben der Auswahl (Zeiger in der Auswahl im Modus Neu) gilt für alle Formen gleich.

## Randfälle

- Rechteck, das teilweise außerhalb der Fläche beginnt oder endet: wird auf die Fläche geklemmt; vollständig außerhalb ergibt keine Auswahl.
- Beim Absetzen auf eine Ebene, die nicht mehr existiert oder die Blockade bekommen hat (Sperre/Ausblenden während des Schwebens ist nur durch die Fenster möglich, die vorher absetzen): wird nie ausgelöst; defensiv schreibt `commit` nichts und bricht sonst nicht ab.
- Zwei Finger während des Anhebens: die Geste endet; der schwebende Inhalt bleibt, `history` bleibt offen.
- Ein laufender Strich oder eine Form (anderes Werkzeug) und ein schwebender Inhalt schließen sich aus: die Werkzeugwechsel-Regel setzt ab.
- Schnelles mehrfaches Antippen von Aktionen (zwei Mal ✓, Einfügen ohne Zwischenablage) darf keinen Fehler und keinen History-Schritt erzeugen.

## Tests (Vitest)

- `Selection`: `rect` (Ecken in beliebiger Reihenfolge, Klemmen, komplett außerhalb → leer), `combine` replace/add/subtract, `contains`, `bounds`, `translated` (Abschneiden), `edges` (Rechteck 2×2 ergibt 8 Kanten; Loch/Nicht-Rechteck), `count`, `isEmpty`.
- Sitzung: Anheben löscht die Quelle in der Ebene und bleibt ein offener Strich (`history.strokeOpen`), Verschieben ändert die Ebene nicht, Absetzen schreibt an die Zielposition (Alpha 255 ersetzt, teiltransparent blendet — Beispielwerte wie bei `blendOver`, Alpha 0 lässt das Ziel), **ein** Undo-Schritt für alles (Undo stellt Quelle und Ziel wieder her, Redo wiederholt), `cancel` stellt die Ebene her und die Maske zurück, Abschneiden am Rand, `lift` auf gesperrter/ausgeblendeter Ebene → `false` ohne Schritt, fehlende Cel legt keine an, Auswahl bleibt nach Ebenen-/Frame-Wechsel (nach Absetzen).
- Spiegeln und Drehen: Pixel- und Maskenposition für ein 3×2-Beispiel (alle vier Dreh-Positionen nach 4× `rotate90` = Ausgangszustand), Mittelpunkt bleibt (bei ungerader/gerader Größe), Abschneiden über den Rand beim Absetzen.
- Kopieren/Ausschneiden/Löschen/Einfügen: Clip entspricht der Maske (Pixel außerhalb = 0), Ausschneiden = Kopieren + Löschen als ein Schritt, Einfügen platziert um die angegebene Mitte, Einfügen in anderem Frame/anderer Ebene, Einfügen ohne Clip und auf gesperrter Ebene → `false` ohne Schritt, Zwischenablage überlebt `reset()`.
- Undo bei Schweben: Hilfsfunktion der Oberfläche (reine Funktion `undoAction(session)`), die entscheidet, ob `cancel` oder `history.undo` gilt.
- Teil 2: `polygon` (Quadrat, Dreieck, konkave Form, entartete Pfade), `region` (zusammenhängend vs. alle, leere Cel, 4er-Nachbarschaft ohne Diagonalen).

## Verifikation im Browser

- Mobil-Viewport (Hoch- und Querformat): Auswahl-Leiste erscheint nur beim Werkzeug Auswahl, Rechteck ziehen, Modi + und −, Verschieben (Loch in der Ebene, Rahmen folgt), Absetzen, Undo/Redo (ein Schritt), Abbrechen per Undo, Kopieren → Ebene/Frame wechseln → Einfügen, Spiegeln, Drehen, Ausschneiden, Löschen; gesperrte/ausgeblendete Ebene zeigt den Hinweis; Öffnen eines Fensters setzt ab; Reload speichert das abgesetzte Ergebnis.
- Teil 2: Lasso mit dem Finger, Zauberstab (zusammenhängend und alle Farben) auf einer Ebene mit mehreren Flächen.
