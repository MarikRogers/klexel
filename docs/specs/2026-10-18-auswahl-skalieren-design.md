# Auswahl skalieren – Design

Stand: 2026-10-18 · Projekt: Klexel (`D:\source\repos\klexel`) · baut auf `2026-10-16-auswahl-design.md` auf (Auswahl, schwebende Auswahl, Absetzen) · nutzt `resizePhoto`/`boxResize` (`src/photo/resize.ts`) und `quantize` (`src/photo/quantize.ts`) aus „Foto zu Pixelart"

## Ziel

Eine Auswahl lässt sich **mit dem Finger größer und kleiner ziehen**: an den Ecken und an den Kanten der Auswahl, wie man es aus Bildbearbeitungs-Apps kennt. Beim Verkleinern reduzieren sich die Pixel ähnlich wie beim Foto-Import, beim Vergrößern bleiben sie scharf.

Entschieden (vom Nutzer):

- **Griffe nach Variante „C: Ecken und Balken"** (am Mockup ausgewählt): vier große runde Griffe an den Ecken, vier kurze Balken in der Mitte der Kanten.
- **Ecken skalieren proportional**, **Balken nur in eine Richtung** (Strecken oder Stauchen). Der Nutzer hat den Vorschlag bestätigt; üblich ist dies bei Touch-Apps, weil es dort keine Shift-Taste gibt.
- **Pixelreduzierung wie beim Foto-Import**, aber **mit den Farben der Auswahl selbst** statt mit der Farbpalette unten (Empfehlung des Planers, vom Nutzer bestätigt). Das Sprite behält so seinen Look.

Aus dem Gespräch als Annahmen des Planers, vom Nutzer nicht widersprochen, aber nicht einzeln bestätigt: Vergrößern bleibt scharf (keine Weichzeichnung); halbtransparente Pixel werden beim Skalieren ganz oder gar nicht deckend; die Größenänderung ist, wie Verschieben und Drehen, Teil der schwebenden Auswahl.

Korrektur zur Gesprächsannahme: Die Griffe erscheinen **bei jeder Auswahl**, nicht erst im schwebenden Zustand. Das Skalieren hebt die Auswahl beim ersten Ziehen an, genau wie das Verschieben.

Nicht Teil dieser Spec:

- Freies Drehen, Scherung, Spiegeln durch Ziehen über die Gegenseite hinaus (die Größe hat eine Untergrenze von 1 Pixel; Spiegeln gibt es weiter über die vorhandene Schaltfläche).
- Auswahl für Interpolationsart oder Farbmodus beim Skalieren, Zahleneingabe der Größe.
- Skalieren der ganzen Ebene, des ganzen Bildes oder mehrerer Frames.
- Skalieren ohne vorhandene Auswahl.

## Bedienung

### Griffe

- Sobald eine Auswahl besteht (Werkzeug **Auswahl** aktiv, mit Maske oder schwebend), zeigt Klexel um deren **umschließendes Rechteck** (`Selection.bounds()` bzw. das Rechteck der schwebenden Auswahl) acht Griffe: vier Ecken (rund, weiß mit schwarzer Kontur) und vier Kantenbalken (abgerundet, in der Kantenmitte). Das gilt auch für Lasso und Zauberstab; dann gilt das Rechteck um die Auswahl.
- Die Griffe liegen **außerhalb** des Rechtecks, so dass das Innere der Auswahl zum Verschieben frei bleibt, auch bei winzigen Auswahlen. Jeder Griff hat eine **Touchfläche von mindestens 44 × 44 Bildschirmpixeln** (im Querformat 40, wie andere Buttons). Sicht- und Berührbereich dürfen sich nicht ins Rechteck hinein erstrecken.
- Griffgröße und Abstand sind unabhängig vom Zoom (feste Bildschirmgröße). Liegt ein Griff außerhalb der sichtbaren Zeichenfläche, wird er an deren Rand geschoben, bleibt aber seinem Rechteck zugeordnet.
- Bei Auswahl-Werkzeug und bestehender Auswahl haben die Griffe **Vorrang** vor „Verschieben" (Inneres) und „neue Auswahl". Ecken haben Vorrang vor Balken.
- Ohne Auswahl, mit anderem Werkzeug oder bei gesperrter/ausgeblendeter Ebene gibt es kein Skalieren (bei gesperrter oder ausgeblendeter Ebene zeigt Ziehen an einem Griff den bekannten Hinweis „Ebene gesperrt" bzw. „Ebene ausgeblendet", `drawBlockReason`).

### Ziehen

- **Ecke:** Die **gegenüberliegende Ecke bleibt fest**. Das Seitenverhältnis des Rechtecks zu Beginn des Ziehens bleibt erhalten. Der Faktor ergibt sich aus der Fingerposition (der größere der beiden Achsenfaktoren gewinnt, so dass die Ecke dem Finger folgt).
- **Balken:** Die **gegenüberliegende Kante bleibt fest**; nur die Breite (links/rechts) bzw. Höhe (oben/unten) ändert sich.
- Größen sind **ganze Pixel**, mindestens **1 × 1**, höchstens **128 pro Seite** (`MAX_SIZE`). Ziehen über die Gegenseite hinaus macht die Auswahl nicht negativ, sondern hält sie bei 1 Pixel.
- Der Finger zieht nicht an der exakten Position des Griffs: Der Abstand zwischen Berührpunkt und Griffmitte beim Aufsetzen wird beibehalten (kein Springen).
- Während des Ziehens ist die **Vorschau live** (die skalierte schwebende Auswahl wird an der neuen Stelle gezeichnet), und neben der Auswahl steht die neue Größe, z. B. „24×30" (Vorschlag des Planers, kleiner Hinweis, kein Eingabefeld).
- Beim Aufsetzen wird die Auswahl bei Bedarf angehoben (`SelectionSession.lift()`, wie beim Verschieben). Danach schwebt sie wie nach Verschieben, Spiegeln oder Drehen; **Absetzen** (✓ in der Auswahlleiste) legt sie ins Bild. Ein Absetzen ist **ein** Undo-Schritt, egal wie oft vorher verschoben, gedreht oder skaliert wurde. Undo während des Schwebens bricht ab (wie bisher).
- **Ein zweiter Finger** beim Ziehen bricht das Skalieren ab und stellt den Zustand vom Beginn dieses Ziehens wieder her; dann gilt die vorhandene Zwei-Finger-Geste (Verschieben/Zoomen).
- Mehrmaliges Skalieren hintereinander ist erlaubt. Jedes Ziehen rechnet **aus dem Zustand zu Beginn dieses Ziehens**, nicht aus der vorherigen Zwischenvorschau; so entsteht beim Hin- und Herziehen innerhalb einer Geste **kein Qualitätsverlust**. Zwischen zwei Gesten summieren sich die Verluste (wie in jeder Bildbearbeitung).

### Pixel und Farben

Für jede Achse einzeln: wird sie **größer** (oder gleich), bleibt jedes Quellpixel scharf erhalten (Nächster Nachbar, jedes Pixel wird so oft wiederholt wie nötig, Rundung gleichmäßig verteilt); wird sie **kleiner**, wird **gemittelt** wie in `boxResize` (Flächenmittel, alpha-gewichtet).

- Ist mindestens eine Achse kleiner geworden, werden die gemittelten Farben **auf die Farben der Quell-Auswahl abgebildet**: Palette = verschiedene RGB-Werte der deckenden Pixel (Alpha ≥ 128) der schwebenden Auswahl zu Beginn des Ziehens, in Reihenfolge des ersten Auftretens; Abbildung über `quantize(..., 'none', false)` aus `src/photo/quantize.ts` (nächste Farbe im RGB-Raum, kein Dithering). Dabei gilt wie dort: **Alpha < 128 wird transparent, alles andere deckend** (Alpha 255).
- Hat die Quelle **mehr als 256 verschiedene Farben**, wird nicht abgebildet (zu langsam und sinnlos für fotoartige Inhalte); es gilt nur die Alpha-Regel, die gemittelten Farben bleiben.
- Wird keine Achse kleiner (reines Vergrößern), bleiben Farben und Alphawerte der Quelle unverändert; es wird nichts gemittelt oder abgebildet.
- **Maske:** Die Maske der schwebenden Auswahl wird mit skaliert (Nächster Nachbar beim Vergrößern, beim Verkleinern gilt ein Zielpixel als ausgewählt, wenn mindestens die Hälfte seiner Quellfläche ausgewählt war). Die Form von Lasso und Zauberstab bleibt damit erhalten.
- Bei sehr starkem Verkleinern kann eine kleine, seltene Farbe verschwinden (das Mitteln überdeckt sie). Das ist hingenommen (kein Sonderfall in dieser Version).

### Grenzen und Ränder

- Die skalierte Auswahl darf über den Rand des Bildes hinausragen; was beim Absetzen außerhalb liegt, wird verworfen (wie beim Verschieben). Die Größe selbst ist durch 128 begrenzt, nicht durch den Bildrand.
- Wechselt der Nutzer Ebene, Frame oder öffnet ein Fenster, wird wie bisher zuvor abgesetzt (`settleSelection`).

## Code-Struktur (Vorschlag, Umsetzer darf anpassen)

Vorhandene Anknüpfungspunkte: `src/edit/SelectionSession.ts` (`Floating`, `lift`, `transform`, `commit`, `cancel`), `src/edit/transform.ts` (Muster für `flipFloating`/`rotateFloating90`), `src/main.ts` (`selectionDown/Move/Up`, `selGesture`, Zwei-Finger-Zweig), `src/render/Viewport.ts` (`drawFloating`, `drawOutline`, Auswahlvorschau), `src/ui/selectionBar.ts`, `src/photo/resize.ts` (`boxResize`), `src/photo/quantize.ts`.

Reine, in Node testbare Bausteine:

- `src/edit/scale.ts`: `scaleFloating(base: Floating, newW: number, newH: number): { pixels: Uint32Array; mask: Uint8Array }` (Vergrößern scharf, Verkleinern gemittelt, Abbildung auf die Farben der Quelle, Maske) und `resizeBox(handle, startBox, dx, dy)`-artige Funktion, die aus Griff, Anfangsrechteck und Fingerverschiebung (Dokumentpixel) das neue Rechteck samt fester Gegenseite berechnet (Proportion bei Ecken, Mindestgröße 1, Höchstgröße 128).
- `src/edit/handles.ts`: Lage der acht Griffe aus dem Rechteck in Bildschirmkoordinaten (außerhalb, Abstand, Begrenzung auf die sichtbare Fläche) und Trefferprüfung mit 44-px-Touchflächen und Vorrang Ecke vor Balken.
- `SelectionSession.scaleTo(base: Floating, box: Rect): LiftResult` ersetzt die schwebende Auswahl durch die aus `base` skalierte an Position und Größe von `box`; `base` ist der Zustand zu Beginn des Ziehens.
- Zeichnen der Griffe und der Größenanzeige im `Viewport`; Verdrahtung der Geste (`'scale'` als weitere Art in `selGesture`) in `main.ts`.

Tests (Vitest, Node):

- **scaleFloating:** Vergrößern auf das Doppelte wiederholt jedes Pixel genau 2 × 2; ungerade Faktoren (3 → 5) verteilen die Rundung gleichmäßig und enthalten nur Quellfarben; Verkleinern liefert nur Farben aus der Quellmenge (kein Pixel mit einer neuen Mischfarbe); Verkleinern einer Zweifarben-Auswahl ergibt nur diese zwei Farben und Transparenz; gemischte Achsen (breiter, niedriger) sind auf der vergrößerten Achse scharf; Quelle mit mehr als 256 Farben bleibt gemittelt, ohne Abbildung; halbtransparente Pixel werden ganz oder gar nicht deckend beim Verkleinern; reines Vergrößern lässt Alpha unverändert; Maske eines Lassos bleibt form-treu (Hälfte-Regel); 1 × 1 als Ziel funktioniert; 128 als Ziel funktioniert; Ausgangsgröße gleich Zielgröße liefert dieselben Pixel.
- **resizeBox:** Ecke hält das Seitenverhältnis, Gegenecke fest (alle vier Ecken); Balken ändert nur eine Achse, Gegenkante fest (alle vier Balken); Untergrenze 1 × 1 beim Ziehen über die Gegenseite; Obergrenze 128; Rundung auf ganze Pixel.
- **handles:** acht Griffe, alle außerhalb des Rechtecks; Touchfläche mindestens 44 px; Treffer auf Ecke vor Balken, bei kleiner Auswahl überlappen Griffzonen nicht das Innere; Begrenzung an den Rand der Fläche; kein Treffer im Inneren.
- **Session:** Skalieren hebt an (eine History-Transaktion), mehrmaliges Skalieren hintereinander rechnet aus `base`, Hin- und Herziehen innerhalb einer Geste verliert nichts (Ergebnis bei Rückkehr zur Ausgangsgröße gleicht der Quelle), Abbrechen stellt `base` wieder her, Absetzen ist ein Undo-Schritt, gesperrte Ebene gibt den Fehler ohne Änderung zurück.

## Offen für den Umsetzer

- Genaue Größe, Abstand und Farbe der Griffe und der Größenanzeige im Rahmen der Beschreibung oben; Touch-Größen nach dem Ausprobieren auf dem Gerät.
- Wie die Geste in `selGesture` abgebildet wird (neue Art `'scale'` mit Griffname, Anfangsrechteck und `base`), ohne Verschieben und Lassoformen zu stören.
- Ob die Obergrenze 256 für die Farbabbildung in der Praxis flüssig bleibt (Schätzung des Planers; sie gehört als Konstante an einen Ort); bei Bedarf Abbildung erst beim Loslassen und während des Ziehens nur die gemittelte Vorschau.
- Wortlaut der Größenanzeige.
