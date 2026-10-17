# Foto → Pixelart – Design

Stand: 2026-10-18 · Projekt: Pixelart-PWA (`D:\source\docs\pixelart`, veröffentlicht als Klexel) · baut auf `2026-10-18-konsolenexport-design.md` auf (Paletten `PICO8`, `PICOTRON`) · Idee 2 aus `../ideen/2026-10-18-werkbank.md`

## Ziel

Ein Foto wird in Klexel geladen und **direkt zu einem Sprite heruntergerechnet**: verkleinert auf eine wählbare Pixelgröße und auf eine Palette abgebildet, wahlweise mit Dithering. Das Ergebnis ist ein normales Klexel-Bild, das man mit allen Werkzeugen weiter bearbeitet. Es ist auf dem Handy sofort vorzeigbar und teilbar. Erfolg heißt: Foto wählen, Größe und Palette einstellen, Vorschau sehen, übernehmen. Danach ist es ein ganz normales Dokument. Alles bleibt auf dem Gerät.

Entschieden (vom Nutzer): Zweck ist **das Bild direkt als Sprite zu verwenden** (kein Nachzeichnen, kein Hintergrund). Ablauf: Foto laden → Zielgröße und Palette wählen → Vorschau → als Bild übernehmen. Für das Seitenverhältnis kann der Nutzer zwischen **drei Möglichkeiten wählen**: Zuschneiden (Ausschnitt verschiebbar), Einpassen mit leeren Rändern, Seitenverhältnis behalten (nur eine Seitenlänge vorgeben). Das Ergebnis **ersetzt das aktuelle Bild** (mit Sicherheitsabfrage), es gibt noch keinen Projekt-Browser. Bestätigt (vom Nutzer, als Vermutung vorgelegt): Zielgrößen 8–128 (Vorgaben 16/32/64), Paletten PICO-8, Picotron und die aktuelle Klexel-Palette, Dithering wählbar (aus/Bayer/Floyd-Steinberg, Vorgabe aus), Vorschau mit „Original halten" wie beim Konsolenexport.

Nicht Teil dieser Spec: Kamera-Aufnahme, Import von Lospec-Paletten und eigene Paletten, Teilen-mit-Klexel (Web Share Target), Foto als Ebene oder Referenz, Rückgängig für das Ersetzen des Bildes, Speichern des Fotos, Zoom im Ausschnitt (optional, wenn der Umsetzer es billig mitbekommt), Anpassung von Helligkeit/Kontrast.

## Bedienung

- Neuer Button **„Foto"** in der Dateizeile neben Neu/PNG laden/PNG speichern (Symbol und Beschriftung wie die vorhandenen Buttons). Er öffnet die Dateiauswahl für Bilder (`image/*`). Die Auswahl ruft **nicht** den vorhandenen PNG-Import auf, der Bilder 1:1 übernimmt.
- Nach der Auswahl öffnet sich ein **Dialog** im Stil der vorhandenen (`aboutDialog`, `consoleExportDialog`, Touch-Größen mindestens 44 px):
  1. **Modus** (Seitenverhältnis): „Zuschneiden", „Einpassen", „Verhältnis behalten".
  2. **Größe:**
     - Zuschneiden und Einpassen: Breite und Höhe (beide 1–128, Vorgaben als Schnellwahl 16×16, 32×32, 64×64; Vorgabe 32×32).
     - Verhältnis behalten: **längste Seite** 1–128 (Vorgaben 16/32/64); die andere Seite folgt dem Foto, mindestens 1.
  3. **Palette:** PICO-8, Picotron, „Aktuelle" (die Farbfelder von Klexel).
  4. **Dithering:** Aus (Vorgabe), Bayer, Floyd-Steinberg.
- **Zuschneiden:** Der Ausschnitt hat das Seitenverhältnis der Zielgröße und deckt das Foto so weit wie möglich ab. Der Nutzer verschiebt das Foto in der Vorschau mit dem Finger (Ziehen); der Ausschnitt bleibt immer innerhalb des Fotos.
- **Einpassen:** Das ganze Foto wird in die Zielgröße eingepasst und mittig platziert; die Ränder bleiben **transparent**.
- **Vorschau:** zeigt das Ergebnis pixelscharf vergrößert (ohne Glättung) auf einem Hintergrund, auf dem Transparenz erkennbar ist. Eine Taste **„Original halten"** zeigt, solange sie gedrückt ist, dasselbe Ergebnis **ohne Palette** (nur verkleinert), damit man sieht, was die Palette verändert. Pointer-, Tastatur- und Kontextmenü-Verhalten wie beim Konsolenexport.
- **„Übernehmen"** ersetzt das aktuelle Bild durch das Ergebnis. Ist das aktuelle Bild nicht leer (mindestens ein deckendes Pixel in irgendeiner Ebene oder einem Frame), erscheint vorher eine Abfrage **„Das aktuelle Bild wird ersetzt. Fortfahren?"** (Ersetzen/Abbrechen). Ein leeres Bild wird ohne Abfrage ersetzt. „Abbrechen" schließt den Dialog ohne Änderung.
- Das Dokument hat danach **eine Ebene und einen Frame** in der Ergebnisgröße; die History ist neu (wie nach „Neu"). Die Farbfelder (Palette) von Klexel bleiben unverändert.
- Fehler: Lässt sich die Datei nicht als Bild laden, erscheint ein Hinweis („Bild konnte nicht geladen werden"), der Dialog öffnet sich nicht.

## Umsetzung

### Verkleinern

- Das Foto wird unter Beachtung der EXIF-Ausrichtung dekodiert (`createImageBitmap(file, { imageOrientation: 'from-image' })`). Sehr große Fotos (über 4096 Pixel an der längsten Seite) dürfen beim Dekodieren verkleinert werden, damit der Speicher auf dem Handy reicht.
- Die Verkleinerung auf die Zielgröße rechnet **Flächenmittel** (Box-Filter) bzw. eine gleichwertige Qualität (zum Beispiel schrittweises Halbieren auf einem Canvas mit hoher Glättungsstufe, dann ein letzter Schritt). Ein einfaches Nearest-Neighbor-Abtasten ist nicht gut genug (Rauschen).
- Transparente Quellpixel (PNG mit Alpha) bleiben mit ihrem Alpha erhalten; beim Mitteln wird alpha-gewichtet gemittelt.

### Auf Palette abbilden

- **Neue Funktion** (nicht `reducePixels` aus dem Konsolenexport): Fotos dürfen **Schwarz** enthalten, das Ergebnis ist ein ganz normales Bild.
- Palettenabstand: euklidisch im RGB-Raum (Umsetzer darf einen wahrnehmungsnäheren Abstand wählen, wenn er das begründet und testet).
- **Index 0 bei PICO-8 und Picotron (Entscheidung des Planers):** Bei den Konsolenpaletten wird die **erste Farbe (Schwarz, Index 0) nicht verwendet** — es gilt die nächste andere Farbe. Grund: Beim Konsolenexport ist Index 0 „durchsichtig"; so ist ein Foto-Sprite beim Export ohne Anpassung exportierbar. Bei „Aktuelle" Palette gibt es keine solche Ausnahme.
- Pixel mit Alpha < 128 bleiben **transparent** (nicht abgebildet); alle anderen werden deckend (Alpha 255).
- **Dithering:**
  - *Aus:* nächste Palettenfarbe.
  - *Bayer:* geordnetes Dithering mit 4×4-Matrix (deterministisch).
  - *Floyd-Steinberg:* Fehlerverteilung mit den üblichen Gewichten (7/16, 3/16, 5/16, 1/16), zeilenweise von links nach rechts; Transparenz verteilt keinen Fehler.
  Beide Verfahren liefern für gleiche Eingabe dasselbe Ergebnis (keine Zufallswerte).

### Ergebnis ins Dokument

- `new PixelDocument(width, height)` mit den Ergebnispixeln (`0xRRGGBBAA`) in der einzigen Ebene; danach wie bisher `attach(...)` und Speichern anstoßen (siehe `main.ts`, Import/Neu).

## Code-Struktur (Vorschlag, Umsetzer darf anpassen)

- `src/photo/resize.ts`: reine Funktionen für Geometrie (Größe bei „Verhältnis behalten", Ausschnitt beim Zuschneiden mit Verschiebung, Einpassen) und Box-Filter-Verkleinerung auf `Uint32Array`.
- `src/photo/quantize.ts`: Palettenabbildung mit den drei Dithering-Arten.
- `src/ui/photoDialog.ts`: Dialog, Vorschau, Verschieben des Ausschnitts, Abfrage zum Ersetzen; `main.ts` verdrahtet den Button und `attach`.
- Tests (Vitest, Node, kein DOM): Größenberechnung (z. B. 4000×3000, längste Seite 32 → 32×24), Ausschnittgrenzen, Box-Filter an kleinen Beispielen, Palettenabbildung (Schwarz bei PICO-8 nie Index 0; Schwarz bei „Aktuelle" erlaubt), Transparenz, Bayer- und Floyd-Steinberg-Ergebnis an einem festen kleinen Verlauf, Wiederholbarkeit.

## Offen für den Umsetzer

- Genauer Platz und Symbol des Buttons.
- Wie der Ausschnitt in der Vorschau verschoben wird (Ziehen auf dem Vorschaubild); Zoom nur, wenn leicht.
- Konkrete Verkleinerungsstrategie auf dem Canvas.
- Farbabstand (RGB vs. wahrnehmungsnäher).
- Verhalten bei der „Aktuellen" Palette, wenn sie weniger als 2 Farben hat (Hinweis, kein Absturz).
