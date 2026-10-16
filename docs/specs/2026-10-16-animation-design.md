# Animation / Spritesheets – Design

Stand: 2026-10-16 · Projekt: Pixelart-PWA (`D:\source\docs\pixelart`, veröffentlicht als klexel) · baut auf `2026-10-16-ebenen-design.md` auf

## Ziel

Die App bekommt Frames: eine Animation aus mehreren Einzelbildern, bearbeitet mit den vorhandenen Werkzeugen und Ebenen. Hauptzweck sind **Spiel-Sprites**: Vorschau als Loop und Export als Spritesheet-PNG (pixelgenau, 1:1 möglich) oder als Einzelbilder. Es bleibt ein persönliches, mobiles Werkzeug ohne Konto und Cloud. Erfolg heißt: Man kann Frames anlegen, bearbeiten, ordnen, mit Onion Skin zeichnen, die Animation abspielen und als Spritesheet oder ZIP exportieren, jede Aktion ist per Undo zurücknehmbar, und alte Stände laden weiter.

Entschieden (vom Nutzer): Frames und Ebenen — **gemeinsame Ebenenliste, eigener Pixelinhalt pro Ebene und Frame**. Funktionsumfang v1: Frames hinzufügen/duplizieren/löschen/verschieben, Vorschau-Loop mit FPS, Onion Skin. Export: Spritesheet-PNG (Streifen und Raster) und einzelne Frame-PNGs. Bedienung über einen Button, der ein eigenes ausklappbares Fenster öffnet. Annahmen (vom Nutzer bestätigt): Vorschau im Fenster, ZIP für Einzelbilder, Grenzen 64 Frames und 16 Mio. Pixel, Undo springt zum betroffenen Frame.

Nicht Teil dieser Spec: Dauer pro Frame, Tags/benannte Animationen, GIF-Export, JSON-Begleitdatei, Auswahl-Werkzeug, verknüpfte Cels, Zwischenbilder (Tweening), Onion Skin über mehr als einen Nachbarframe.

## Datenmodell (`src/model/Document.ts`)

```ts
interface Frame { id: number }          // eindeutig ab 1, wird nie wiederverwendet
interface Layer extends LayerProps {
  id: number;
  cels: Map<number, Uint32Array>;       // frameId -> Pixel (w*h); fehlender Eintrag = komplett transparent
}
```

- `PixelDocument` hält zusätzlich `frames: Frame[]` (Reihenfolge = Abspielreihenfolge), `currentFrameId` und `nextFrameId`. Es gibt immer mindestens 1 Frame; `MAX_FRAMES = 64`; `MAX_PIXELS = 16_000_000`.
- **Speicherbudget:** `width * height * layers.length * frames.length <= MAX_PIXELS`. Hinzufügen einer Ebene, eines Frames oder Duplizieren (Ebene oder Frame) ist nur erlaubt, wenn das Ergebnis das Budget einhält.
- `layer.data` entfällt. Zugriff über `doc.cel(layerId, frameId): Uint32Array | undefined` (lesen) und `doc.ensureCel(layerId, frameId): Uint32Array` (legt bei Bedarf ein leeres Feld an). `doc.get(x, y)` liest die **aktive Ebene im aktuellen Frame** (fehlende Cel → 0, legt nichts an); `doc.set(x, y, c)` und der Getter `doc.data` arbeiten auf demselben Feld und legen die Cel bei Bedarf an. Alle Werkzeuge bleiben dadurch unverändert.
- Ein neues Dokument hat genau einen Frame (id 1, `currentFrameId` 1, `nextFrameId` 2). `PixelDocument.fromLayers` wird zu `PixelDocument.restore(state)` mit Frames, Ebenen, `currentFrameId`, `activeId`, `nextId`, `nextFrameId` und prüft: 1..64 Frames, eindeutige ganzzahlige IDs ≥ 1, jede Cel gehört zu einem existierenden Frame und hat Länge `w*h`, Budget eingehalten; sonst `RangeError`.
- Primitive ohne History (von `History` genutzt): `createFrame(): Frame`, `insertFrame(frame, index)`, `removeFrame(id): { frame, index, cels: Map<number /*layerId*/, Uint32Array | undefined> }` (wirft bei letztem Frame; ändert `currentFrameId` nicht und nimmt die Cels aus allen Ebenen heraus), `moveFrame(id, toIndex)`, `setCurrentFrame(id)`, `frameIndex(id)`, `restoreFrameCels(frameId, cels)`. Die bestehenden Ebenen-Primitive (`insertLayer`, `removeLayer`, `moveLayer`, `setLayerProps`, `setActive`) bleiben; `removeLayer` liefert die Ebene samt allen Cels.

### Compositing

- `composite()` bleibt für den **aktuellen Frame** (gleiche Regeln wie in der Ebenen-Spec: unten nach oben, nur sichtbare Ebenen, Source-over, Deckkraft-100-Schnellpfad). Neu: `compositeFrame(frameId): Uint32Array` für beliebige Frames (Vorschau, Thumbnails, Onion Skin, Export); es gibt einen Cache **pro Frame**.
- `touch(frameId?: number)`: mit Frame-ID wird nur der Cache dieses Frames verworfen, ohne ID alle. Pixel-Änderungen rufen `touch(frameId)` des geänderten Frames; Struktur-, Sichtbarkeits- und Deckkraft-Änderungen rufen `touch()`.
- `getComposite(x, y)` bezieht sich auf den aktuellen Frame.

### Aktionsregeln

`layerActions(doc)` bekommt zusätzlich die Budgetprüfung für `canAdd`/`canDuplicate`. Neu: `frameActions(doc): { canAdd; canDuplicate; canRemove; canMoveLeft; canMoveRight }` — `canAdd`/`canDuplicate` berücksichtigen `MAX_FRAMES` und das Budget; `canRemove` nur bei mehr als einem Frame; `canMoveLeft/Right` nur nicht am Rand.

## Werkzeug-Regeln

Unverändert gegenüber der Ebenen-Spec; sie gelten im aktuellen Frame. Gesperrt/ausgeblendet blockiert wie bisher. Ein laufender Strich oder eine Form wird verworfen, wenn der Frame gewechselt, ein Frame-Befehl ausgeführt oder das Frames-Fenster geöffnet wird. Die Pipette liest `getComposite` des aktuellen Frames.

## History (`src/model/History.ts`)

Neue und geänderte Schritte (alle Teil des gemeinsamen Stacks, Limit 100, ein neuer Schritt leert Redo; `setCurrentFrame` ist kein Schritt):

| Art | Inhalt | Undo |
|---|---|---|
| `pixels` | zusätzlich `frameId` | `before` zurückschreiben **und** zum Frame springen |
| `addFrame` | Frame, Index, vorheriger und neuer `currentFrameId` | Frame entfernen (leere Cels), `currentFrameId` zurück |
| `duplicateFrame` | Frame, Index, Kopien der Cels je Ebene, vorherige `currentFrameId` | Frame entfernen, zurückspringen |
| `removeFrame` | Frame, Index, alle Cels je Ebene (`layerId → Uint32Array \| undefined`), vorherige und nachfolgende `currentFrameId` | Frame mit allen Cels wieder einfügen, zum Frame springen |
| `moveFrame` | `id`, `from`, `to` | zurückschieben |
| `remove` / `merge` / Ebenen-Schritte | speichern die Ebene mit **allen** Cels (Map) | wie bisher |

- Redo ist jeweils das Gegenstück; Undo/Redo eines `pixels`-Schritts setzt `currentFrameId` auf den Frame des Schritts (damit man die Änderung sieht).
- API: `addFrame(): Frame | null` (leerer Frame direkt nach dem aktuellen, wird aktuell), `duplicateFrame(): Frame | null` (Kopie aller Cels direkt nach dem aktuellen, wird aktuell), `removeFrame(): boolean` (aktueller Frame; danach wird der vorherige Frame aktuell, sonst der erste), `moveFrame(delta: 1 | -1): boolean`; `null`/`false` bei Grenzen, ohne Schritt.
- `mergeDown` verschmilzt in **jedem** Frame die Cel der oberen Ebene in die der unteren (`blendOver` mit der Deckkraft der oberen Ebene; fehlende obere Cel: nichts zu tun; fehlende untere Cel: wird angelegt); der Schritt hält die vorherigen Cels der unteren Ebene aller Frames.
- `duplicateLayer` kopiert die Cels aller Frames. `addLayer` legt keine Cels an.
- `begin()` merkt `layerId` **und** `frameId`; `set` schreibt in diese Cel (über `ensureCel`).

## Oberfläche

- Neuer Button **Frames** in der oberen Leiste (Icon: Filmstreifen, SVG, `stroke-width="1.25"`). Er öffnet/schließt das Frames-Fenster; das Ebenen-Fenster und das Frames-Fenster sind **nie gleichzeitig** offen (Öffnen des einen schließt das andere, inkl. Commit einer ausstehenden Deckkraft-Vorschau).
- **Layout** wie das Ebenen-Fenster: Hochformat Sheet von unten (höchstens 60 % der Höhe, scrollt), Querformat 280 px breit rechts, Safe Areas beachtet, Touch-Ziele mindestens 40 px.
- **Frame-Streifen** (waagerecht scrollbar): pro Frame ein Tile mit 24×24-Vorschau (`compositeFrame`) und Nummer (Position, ab 1); Antippen setzt den aktuellen Frame (`discardStroke()`, kein History-Schritt); der aktuelle ist hervorgehoben. Beim Zeichnen wird nur das Tile des aktuellen Frames neu gezeichnet (höchstens einmal pro Animationsframe), alle anderen bei Strukturänderung, Undo/Redo, Wechsel des Dokuments und beim Öffnen.
- **Aktionen:** Hinzufügen, Duplizieren, Löschen, Nach links, Nach rechts (je nach `frameActions` aktiviert). Ist das Budget oder `MAX_FRAMES` erreicht, zeigt der deaktivierte Button beim Antippen einen Hinweis ("Frame-Limit erreicht" bzw. "Speicherlimit erreicht").
- **Abspielen:** Button Abspielen/Stopp und FPS-Schieber 1–30 (Standard 8) mit Zahlenanzeige. Die Vorschau läuft in einer eigenen Canvas im Fenster (Frames in Reihenfolge, nearest-neighbor, ausgeblendete Ebenen nicht sichtbar) und lässt die Zeichenfläche unberührt; sie stoppt beim Schließen des Fensters, beim Wechsel des Dokuments und wenn nur noch ein Frame existiert. Ändert sich die Frame-Liste während des Abspielens, läuft die Vorschau mit der neuen Liste weiter, ohne Fehler.
- **Onion Skin:** Schalter im Fenster. Aktiv und mit mehr als einem Frame zeichnet der Viewport hinter dem aktuellen Frame den vorherigen (Tönung rot, `255,80,80`) und den nächsten Frame (Tönung blau, `80,140,255`) mit je 30 % Deckkraft; am ersten Frame gibt es keinen vorherigen, am letzten keinen nächsten (kein Umlauf). Nur Anzeige, nicht im Export.
- **Export-Bereich** im Fenster: Layout (waagerechter Streifen / senkrechter Streifen / Raster), Spaltenzahl (nur bei Raster, 1..Frameanzahl, Standard `ceil(sqrt(n))`), Skalierung 1×/2×/4×/8× (Standard 1×), Buttons **Spritesheet (PNG)** und **Einzelbilder (ZIP)**. Der bestehende Export-Button der oberen Leiste (aktueller Frame als PNG, wie bisher) bleibt unverändert.
- Beim Ändern des Frames werden Zeichenfläche, Ebenen-Vorschauen, Frames-Fenster und Undo/Redo-Zustand aktualisiert und der Autosave ausgelöst.

### Verhalten der Operationen

- **Hinzufügen:** neuer leerer Frame direkt nach dem aktuellen, wird aktuell. **Duplizieren:** Kopie direkt nach dem aktuellen, wird aktuell. **Löschen:** der aktuelle Frame; danach wird der vorherige aktuell, sonst der erste; letzter Frame nicht löschbar. **Verschieben:** tauscht den aktuellen Frame mit seinem Nachbarn.

## Export (`src/export/`)

- `sheetLayout(count: number, frameW: number, frameH: number, mode: 'row' | 'column' | 'grid', columns?: number): { cols: number; rows: number; width: number; height: number; positions: Array<{ x: number; y: number }> }` — reine Funktion (Pixelmaße bei Skalierung 1×); `row` = `cols = count, rows = 1`; `column` = `cols = 1, rows = count`; `grid` = `cols = clamp(columns, 1, count)`, `rows = ceil(count / cols)`; Frames zeilenweise von links oben; nicht belegte Zellen bleiben transparent.
- `renderSheet(doc, mode, columns, scale): Promise<Blob>` — PNG über `compositeFrame` aller Frames, Skalierung ganzzahlig ohne Glättung.
- `buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array` — ZIP **ohne Kompression** (Methode „stored“) mit korrektem CRC-32, Local File Header, Central Directory und End-Record; kein Zip64, Namen UTF-8; `frameFiles(doc, scale): Promise<Array<{ name; data }>>` liefert `frame-001.png`, `frame-002.png`, … (dreistellig, bei mehr als 999 Frames entsprechend länger, hier unerreichbar wegen 64).
- Speichern/Teilen über dieselbe Logik wie der bestehende PNG-Export (Web Share mit Datei, sonst Download); der gemeinsame Teil wird nach `src/export/saveBlob.ts` herausgezogen. Dateinamen `spritesheet.png` bzw. `frames.zip`.

## Speichern, Laden (`src/storage/`)

- Gespeichert wird `{ version: 3, width, height, frames: [{id}], currentFrameId, nextFrameId, layers: [{id, name, visible, locked, opacity, cels: Record<string, Uint32Array>}], activeId, nextId, fps, onion, palette, color }` (Schlüssel von `cels` = Frame-ID als Text, nur vorhandene Cels).
- **Migration:** Stände mit `version: 2` (Ebenen mit `data`) und Stände ohne `version` (Einzelebene) werden zu **einem Frame** (id 1, `currentFrameId` 1, `nextFrameId` 2) mit `cels: { "1": data }`, `fps` 8, `onion` false.
- Ungültige oder beschädigte Stände (Frame-Zahl 0 oder > 64, doppelte/ungültige Frame-IDs, Cel für unbekannten Frame, falsche Cel-Länge, `currentFrameId` unbekannt, `fps` nicht ganzzahlig 1..30, `onion` kein Boolean, Budget überschritten, plus alle bisherigen Prüfungen der Ebenen-Spec) werden verworfen; die App startet dann mit einem leeren Dokument. `nextFrameId` wird auf `max(id)+1` angehoben, falls zu klein.
- `fps` und `onion` sind Dokument-Einstellungen, **kein** History-Schritt.
- **PNG-Import** erzeugt ein Dokument mit einem Frame und einer Ebene; PNG-Export (oberer Button) nutzt `composite()` des aktuellen Frames.

## Rendering (`src/render/Viewport.ts`)

- Zeichnet `composite()` des aktuellen Frames; Onion Skin wird vor dem aktuellen Frame gezeichnet (vorheriger und nächster Frame getönt mit 30 % Deckkraft); Schachbrett, Raster und Form-Vorschau bleiben unverändert.
- Onion-Kompositionen kommen aus `compositeFrame` (Cache pro Frame), damit Zeichnen im aktuellen Frame sie nicht neu berechnet.

## Randfälle

- Löschen oder Verschieben von Frames während eines Strichs: der Strich wird verworfen (`discardStroke`).
- Wird eine Ebene gelöscht, entfallen ihre Cels aller Frames; Undo bringt sie mit allen Cels zurück.
- Zusammenführen und Duplizieren von Ebenen, Hinzufügen von Frames und Ebenen respektieren das Speicherbudget; ein abgelehnter Versuch erzeugt keinen History-Schritt und keinen Fehler.
- Ein laufender Strich wird bei Undo/Redo und beim Öffnen/Schließen von Fenstern wie bisher verworfen.
- Schnelles mehrfaches Antippen (Hinzufügen bei 64 Frames) darf keinen Fehler und keinen Schritt erzeugen.

## Tests (Vitest)

- Dokument: Frame-Liste (min. 1, max. 64), IDs nie wiederverwendet, `cel/ensureCel`, `get` ohne Cel legt nichts an, Budgetprüfung (Frame, Ebene, Duplikate), `restore` mit gültigen/ungültigen Zuständen, `frameActions`.
- Compositing: `compositeFrame` je Frame unabhängig, Cache pro Frame (`touch(frameId)` verwirft nur diesen), fehlende Cels sind transparent.
- History: Undo/Redo je Frame-Schritt (`addFrame`, `duplicateFrame`, `removeFrame` mit Cels aller Ebenen, `moveFrame`), `pixels`-Schritt springt beim Undo zum Frame, `remove`/`merge`/`duplicateLayer` mit mehreren Frames, Grenzen (letzter Frame, 64 Frames, Budget) ohne Schritt, Limit 100.
- Export: `sheetLayout` für `row`, `column`, `grid` (Spaltenzahl 1, n, > n, Standardwert), Positionen; `buildZip` gegen bekannte CRC-32-Werte (z. B. `"123456789"` → `0xCBF43926`) und Aufbau (Signaturen, Offsets, Anzahl Einträge); `frameFiles`-Benennung.
- Storage: Roundtrip mit mehreren Frames/Cels, Migration von v2 und alt, Verwerfen beschädigter v3-Stände (inkl. Budget), `fps`/`onion`-Validierung.

## Verifikation im Browser

- Mobil-Viewport (Hoch- und Querformat): Frames-Fenster öffnen/schließen, exklusiv zum Ebenen-Fenster, Frames hinzufügen/duplizieren/löschen/verschieben, Zeichnen in verschiedenen Frames und Ebenen, Onion Skin an/aus, Abspielen mit FPS, Undo/Redo inkl. Frame-Sprung.
- Reload: Frames, Pixel, aktueller Frame, FPS, Onion bleiben erhalten; ein v2-Stand aus der Vorgängerversion lädt zu einem Frame.
- Export: Spritesheet (Streifen waagerecht/senkrecht, Raster) prüfen — Maße, Position der Frames, 1× pixelgenau; ZIP lässt sich entpacken (Dateien `frame-001.png` …).
