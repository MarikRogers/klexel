# Ebenen – Design

Stand: 2026-10-16 · Projekt: Pixelart-PWA (`D:\source\docs\pixelart`, veröffentlicht als klexel)

## Ziel

Die App bekommt mehrere übereinanderliegende Ebenen, damit Hintergrund, Figur und Details getrennt bearbeitet werden können. Sie bleibt ein persönliches, mobiles Zeichenwerkzeug, ohne Konto und Cloud. Erfolg heißt: Man kann Ebenen anlegen, bearbeiten, ordnen und ausblenden, jede Aktion ist per Undo zurücknehmbar, und PNG-Export sowie Speichern liefern das erwartete Ergebnis.

Entschieden (vom Nutzer): Funktionsumfang pro Ebene = hinzufügen, löschen, aktiv wählen, Sichtbarkeit, Reihenfolge ändern, Deckkraft, Sperren, Umbenennen. Pipette liest das Gesamtbild, Füllen arbeitet nur auf der aktiven Ebene. Bedienung über einen Button, der eine Ebenen-Liste öffnet. Undo für Ebenen-Operationen über eine Befehls-History.

Nicht Teil dieser Spec: Auswahl, Animation/Frames, Blend-Modi, Ebenengruppen. Die Animation (späteres Teilprojekt) baut auf diesem Ebenenmodell auf.

## Datenmodell (`src/model/Document.ts`)

```ts
interface Layer {
  id: number;          // eindeutig im Dokument, ab 1, wird nie wiederverwendet
  name: string;        // Standard "Ebene N"
  visible: boolean;
  locked: boolean;
  opacity: number;     // ganze Zahl 0..100
  data: Uint32Array;   // width*height, 0xRRGGBBAA, 0 = transparent
}
```

- `PixelDocument` hält `layers: Layer[]` (Index 0 = unterste Ebene), `activeId` und `nextId`. Es gibt immer mindestens 1 Ebene, höchstens `MAX_LAYERS = 16`.
- `doc.get/set/inBounds` und `doc.data` beziehen sich auf die **aktive Ebene** (`doc.data` ist ein Getter). Die Werkzeuge (Stift, Radierer, Füllen, Formen) bleiben dadurch unverändert.
- `doc.getComposite(x, y)` liefert die sichtbare Mischfarbe (für die Pipette); `doc.composite()` liefert das ganze Gesamtbild als `Uint32Array`.
- Konstruktor `new PixelDocument(w, h)` legt eine leere Ebene "Ebene 1" an. Zum Wiederherstellen gibt es eine statische `PixelDocument.fromLayers(w, h, layers, activeId)`.
- Methoden für Struktur: `addLayer(at?)`, `removeLayer(id)`, `moveLayer(id, newIndex)`, `setLayerProps(id, partial)`, `duplicateLayer(id)`, `mergeDown(id)`. Sie arbeiten ohne History und liefern, was zum Rückgängigmachen nötig ist; die History ruft sie auf.

### Compositing

Von unten nach oben, nur sichtbare Ebenen, Source-over mit nicht-prämultipliziertem Alpha:

- Quellalpha `sa = (pixelAlpha / 255) * (opacity / 100)`.
- `outA = sa + da * (1 - sa)`; Farbkanal `c = (sc * sa + dc * da * (1 - sa)) / outA`, auf ganze Zahlen gerundet. Ist `outA == 0`, ist das Ergebnis `0`.
- Bei Deckkraft 100 und vollen Alpha-Werten (255 oder 0) ist das Ergebnis exakt das Pixel der obersten sichtbaren, nicht transparenten Ebene.
- Das Gesamtbild wird in einem Puffer gehalten und über ein `dirty`-Flag neu berechnet. Jede Pixel- oder Strukturänderung setzt es.

## Werkzeug-Regeln

- Stift, Radierer, Füllen, Formen schreiben nur in die aktive Ebene (über `History.set`).
- Ist die aktive Ebene **gesperrt oder ausgeblendet**, wird nichts gezeichnet; die App zeigt einen kurzen Hinweis ("Ebene gesperrt" / "Ebene ausgeblendet"). Das gilt am Anfang eines Strichs (`pointerdown`) und gilt für Füllen und Formen genauso.
- Pipette: liest `doc.getComposite(x, y)`; ist das Ergebnis transparent, ändert sie die Farbe nicht (wie bisher).
- Füllen: bestimmt die Region anhand der Pixel der aktiven Ebene.

## History (`src/model/History.ts`) – Befehls-Ansatz

Ein Undo-Schritt ist einer von:

| Art | Inhalt | Undo |
|---|---|---|
| `pixels` | `layerId`, Liste `{i, before, after}` | `before` zurückschreiben |
| `add` | Ebene (voll), Position, vorherige `activeId` | Ebene entfernen, `activeId` zurück |
| `remove` | Ebene (voll mit Pixeldaten), Position, vorherige `activeId` | Ebene wieder einfügen |
| `move` | `id`, `from`, `to` | zurückschieben |
| `props` | `id`, `before`, `after` (Teilmenge: name, visible, locked, opacity) | `before` setzen |
| `merge` | obere Ebene (voll), untere Ebene `before`-Pixel, Position | untere wiederherstellen, obere einfügen |
| `active` | wird **nicht** in die History aufgenommen (Auswahl der aktiven Ebene ist kein Schritt) | – |

- Redo ist jeweils das Gegenstück. Eine neue Aktion leert den Redo-Stack; Limit bleibt 100 Schritte.
- Pixel-Diffs beziehen sich auf eine Ebenen-ID, nicht auf einen Index. Existiert die Ebene bei Undo/Redo nicht mehr, wird der Schritt nicht ausgeführt (kann durch korrekte Reihenfolge der Stapel nicht vorkommen; wird defensiv ignoriert).
- Deckkraft per Schieber: ein Ziehvorgang ergibt **einen** `props`-Schritt (Start bis Loslassen); bei unverändertem Wert entsteht kein Schritt.
- `begin/set/commit/cancel` für Striche bleiben als Schnittstelle erhalten; `set` schreibt in die aktive Ebene und notiert `layerId`.

## Oberfläche

- Neuer Button **Ebenen** in der oberen Leiste (Icon: gestapelte Rauten, SVG, Strichstärke 1,25 wie die übrigen Icons). Er öffnet/schließt die Ebenen-Ansicht.
- **Hochformat:** Sheet, das von unten über die Zeichenfläche und Werkzeugleiste gleitet, maximal 60 % der Höhe, Liste scrollt. **Querformat:** Fenster an der rechten Seite, 280 px breit, über der Werkzeugleiste.
- Eine Zeile pro Ebene, oberste Ebene oben: Miniaturvorschau (24×24 Canvas), Name (Tippen auf den Namen der aktiven Ebene öffnet das Umbenennen), Auge-Button, Schloss-Button. Antippen der Zeile macht sie aktiv; die aktive ist hervorgehoben.
- Unter der Liste: Buttons Hinzufügen, Duplizieren, Nach unten zusammenführen, Löschen, Nach oben, Nach unten; dazu ein Schieber **Deckkraft** (0–100) für die aktive Ebene mit Zahlenanzeige.
- Löschen der letzten verbleibenden Ebene ist nicht möglich (Button deaktiviert). Hinzufügen bei 16 Ebenen deaktiviert. Nach unten zusammenführen bei der untersten Ebene deaktiviert.
- Alle Touch-Ziele mindestens 40 px. Das Sheet respektiert Safe Areas wie die übrige Oberfläche. Beim Einklappen der Leisten (☰) bleibt das Ebenen-Fenster unabhängig bedienbar, solange es geöffnet ist.
- Nach jeder Änderung werden Zeichenfläche, Liste und Undo/Redo-Zustand aktualisiert und der Autosave ausgelöst.

### Verhalten der Operationen

- **Hinzufügen:** neue leere Ebene direkt über der aktiven, wird aktiv.
- **Duplizieren:** Kopie direkt über der aktiven, Name "<Name> Kopie", wird aktiv.
- **Löschen:** aktive Ebene weg; danach wird die darunterliegende (sonst die oberste) aktiv.
- **Zusammenführen nach unten:** die aktive Ebene wird mit ihrer unteren Nachbarin per Compositing (inkl. beider Deckkräfte; die Deckkraft der oberen Ebene wird eingerechnet, die der unteren bleibt als Eigenschaft erhalten und wirkt danach auf das Ergebnis) zu einer Ebene mit den Eigenschaften (Name, Deckkraft, Sichtbarkeit, Sperre) der **unteren**; das zusammengeführte Ergebnis wird aktiv. Die Operation ist deaktiviert, wenn die obere Ebene ausgeblendet oder die untere gesperrt ist.
- **Verschieben:** tauscht die Position um einen Schritt; am Rand deaktiviert.

## Speichern, Laden, Export (`src/storage/storage.ts`)

- Gespeichert wird ein Objekt `{ version: 2, width, height, layers: [{id, name, visible, locked, opacity, data}], activeId, nextId, palette, color }`.
- **Migration:** Hat der geladene Stand kein `version` (alter Stand: `{width, height, data, palette, color}`), wird er zu einem Dokument mit einer Ebene "Ebene 1" (Deckkraft 100, sichtbar, ungesperrt) umgewandelt.
- Ungültige oder beschädigte Stände (falsche Datenlänge, Ebenenzahl 0 oder > 16) werden verworfen; die App startet dann mit einem leeren Dokument.
- **PNG-Export:** verwendet das Gesamtbild (`doc.composite()`); ausgeblendete Ebenen erscheinen nicht.
- **PNG-Import:** erzeugt ein neues Dokument mit einer Ebene "Ebene 1"; die History beginnt leer (wie bisher).
- Die History wird weiterhin nicht gespeichert.

## Rendering (`src/render/Viewport.ts`)

- Zeichnet das Gesamtbild (`doc.composite()`) statt `doc.data`; Schachbrett, Raster und Form-Vorschau bleiben unverändert.
- Ausgeblendete Ebenen werden nicht gezeichnet, ihr Inhalt bleibt erhalten.

## Randfälle

- Dokumentgröße ändert sich nur durch "Neu" oder Import; dann werden die Ebenen verworfen und ein neues Dokument erstellt.
- Ein laufender Strich oder eine Form wird beim zweiten Finger wie bisher verworfen (`History.cancel`); dabei entsteht kein History-Schritt.
- Wechselt die aktive Ebene oder wird die Ebenen-Ansicht geöffnet, während ein Strich läuft, wird der Strich verworfen.
- Wird eine Ebene umbenannt und der Name leer gelassen, gilt der bisherige Name; Namen werden auf 24 Zeichen gekürzt.
- Doppeltes Auslösen schneller Taps (Hinzufügen bei 16 Ebenen) darf keinen Fehler und keinen History-Eintrag erzeugen.

## Tests (Vitest)

- Compositing: Reihenfolge, Transparenz, Deckkraft 50 % auf deckender Ebene, ausgeblendete Ebene wird übersprungen, Ergebnis `0` bei vollständig transparent.
- Dokument: mindestens 1 / höchstens 16 Ebenen, `activeId` nach Löschen, Duplizieren, Verschieben.
- History: Undo/Redo je Schrittart (`pixels`, `add`, `remove`, `move`, `props`, `merge`), Deckkraft-Ziehen ergibt einen Schritt, Redo-Stack wird bei neuer Aktion geleert, Limit 100.
- Werkzeug-Regeln: Zeichnen auf gesperrter/ausgeblendeter Ebene ändert nichts und erzeugt keinen Schritt; Füllen respektiert nur die aktive Ebene.
- Storage: Migration eines Standes ohne `version`, Verwerfen beschädigter Stände, Roundtrip eines Standes mit mehreren Ebenen.

## Verifikation im Browser

- Mobil-Viewport (Hoch- und Querformat): Liste öffnen/schließen, Ebene hinzufügen, auf verschiedenen Ebenen zeichnen, Auge/Schloss, Deckkraft, Verschieben, Zusammenführen, Löschen, jeweils Undo/Redo.
- Reload: Ebenen und aktive Ebene bleiben erhalten; ein alter Einzel-Ebenen-Stand aus der Vorgängerversion lädt korrekt.
- PNG-Export: ausgeblendete Ebenen fehlen, Deckkraft ist eingerechnet.
