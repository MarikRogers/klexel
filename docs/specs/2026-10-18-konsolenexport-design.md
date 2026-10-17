# Konsolenexport (PICO-8, Picotron) – Design

Stand: 2026-10-18 · Projekt: Pixelart-PWA (`D:\source\docs\pixelart`, veröffentlicht als Klexel) · baut auf `2026-10-16-animation-design.md` auf · Idee 1 aus `../ideen/2026-10-18-werkbank.md`

## Ziel

Klexel soll Sprites als **neue Datei** für **PICO-8** (`.p8`) und **Picotron** (`.gfx`) exportieren können, die sich dort direkt öffnen bzw. einbinden lässt. Der Nutzer arbeitet selbst mit beiden Programmen; Picotron meist mit 16×16-Sprites. Erfolg heißt: Ein Klexel-Bild oder eine Animation wird mit wenigen Taps zu einer Datei, die in PICO-8 oder Picotron richtig aussieht; weicht das Bild von der Zielpalette ab, sieht man vorher, was sich ändert; passt etwas nicht ins Zielformat, ist das sichtbar und es wird nichts stillschweigend verändert.

Entschieden (vom Nutzer): immer eine **neue Datei** (kein Einfügen in bestehende Dateien). Zwei Modi, beide verfügbar: **Bild in Raster zerschneiden** und **jeder Frame ein Sprite**. Vorschau der Farbreduzierung nur, wenn tatsächlich abgewichen wird, als **Umschalten** (ein Bild, gedrückt halten zeigt das Original). Passt das Ergebnis nicht ins Zielformat, ist das **sichtbar**, und der Nutzer wählt zwischen **Export gesperrt** und **abgeschnitten**. Picotron-Standardgröße 16×16.

Nicht Teil dieser Spec: Import von `.p8`/`.gfx`, Sprite-Flags, Map-/Sound-/Code-Teile der Dateien, JSON für Godot/Tiled/Aseprite, Auswahl von Teilbereichen, eigene Paletten (kommt mit Foto→Pixelart), Picotron-Karten (`.p64`).

## Bedienung

- Der bisherige Export-Button (`⤓`, PNG) bleibt. Das Konsolenformat kommt als **eigener Export-Dialog** hinzu (Einstieg: Eintrag bzw. Button im bestehenden Export-Bereich; genaue Platzierung entscheidet der Umsetzer im Stil der vorhandenen Dialoge, z. B. `framesPanel`/`aboutDialog`).
- Auswahl im Dialog:
  1. **Ziel:** PICO-8 oder Picotron.
  2. **Modus:** „Bild zerschneiden" oder „Frames als Sprites". Gibt es nur einen Frame, ist „Frames als Sprites" gleichbedeutend mit „ein Sprite" (kein eigener Eintrag nötig, Umsetzer-Entscheidung).
  3. **Spritegröße** (nur Picotron): 8, 16 (Standard) oder 32. PICO-8 ist fest 8.
  4. **Startnummer** (optional, Standard 1): erstes belegtes Sprite. Sprite 0 bleibt frei (siehe unten).
- Der Dialog zeigt dauernd eine **Vorschau des exportierten Ergebnisses** mit eingezeichnetem Raster und Sprite-Nummern.
- **Farbhinweis:** Liegt mindestens ein Pixel nicht exakt auf einer Palettenfarbe des Ziels, erscheint „⚠ N Farben angepasst" (N = Anzahl verschiedener betroffener Farben). Dann gibt es eine Taste **„Original"**: solange sie gedrückt ist, zeigt die Vorschau das ungekürzte Bild, sonst das reduzierte. Ohne Abweichung erscheinen weder Hinweis noch Taste.
- **Größenhinweis:** Passt der Inhalt nicht (siehe „Grenzen"), erscheint eine deutliche Meldung mit Zahlen („Es sind 300 Sprites, PICO-8 fasst 255"). Der Dialog bietet dann zwei Wahlmöglichkeiten: **Abschneiden** (Standard ausgewählt ist keine; der Nutzer muss sich entscheiden) oder **Abbrechen**. Solange keine Wahl getroffen ist, ist „Exportieren" gesperrt. Das Abgeschnittene ist in der Vorschau erkennbar (abgedunkelt).
- Export über den vorhandenen `saveBlob`-Weg (Teilen-Dialog des Telefons oder Download).

## Umsetzung der Daten

### Gemeinsam

- **Quelle:** je Frame das zusammengerechnete Bild (`doc.compositeFrame(frameId)`, wie in `src/export/sheet.ts`), RGBA je Pixel.
- **Transparenz:** Pixel mit Alpha < 128 gelten als transparent; sonst deckend (Halbtransparenz wird nicht gemischt).
- **Reduzierung:** Jede deckende Farbe wird auf die **nächste Farbe der Zielpalette** abgebildet. Eine Farbe gilt als „angepasst", wenn sie nicht exakt in der Palette vorkommt. Farbabstand: euklidisch im RGB-Raum (Umsetzer darf einen wahrnehmungsnäheren Abstand wählen, wenn er das begründet und testet).
- **Transparenz im Ziel:** Transparente Pixel werden als der Index geschrieben, den das Ziel als „durchsichtig" behandelt (PICO-8 und Picotron Standard: Index 0). Deckende Pixel, die auf Index 0 (schwarz) abgebildet würden, bekommen stattdessen die nächste **andere** Palettenfarbe, damit sie nicht durchsichtig werden. Das zählt zu „Farben angepasst". *(Annahme; Umsetzer prüft für beide Ziele, ob Index 0 wirklich durchsichtig ist, und passt an.)*
- **Dokument unverändert:** Reduzierung und Zuschnitt wirken nur auf die Exportdaten.

### Modus „Bild zerschneiden"

- Das Bild (aktueller Frame) wird ab der oberen linken Ecke in Zellen der Spritegröße geschnitten und zeilenweise (links→rechts, oben→unten) nummeriert, beginnend bei der Startnummer.
- Ist die Bildgröße kein Vielfaches der Zellgröße, werden Randzellen mit durchsichtigen Pixeln aufgefüllt (nichts wird abgeschnitten).
- Komplett durchsichtige Zellen werden **nicht** übersprungen (Nummerierung bleibt vorhersehbar, Zellen entsprechen dem Raster).

### Modus „Frames als Sprites"

- Jeder Frame wird ein Sprite, in Frame-Reihenfolge, beginnend bei der Startnummer.
- Ist ein Frame größer als die Spritegröße (z. B. 16×16-Frame bei PICO-8), belegt er mehrere Zellen:
  - **PICO-8:** Der Frame belegt einen Block aus Zellen im Blatt (z. B. 2×2). Seine Sprite-Nummer ist die der oberen linken Zelle. Blöcke werden so gesetzt, dass sie auf dem 16-Zellen-breiten Blatt nicht über den rechten Rand ragen.
  - **Picotron:** Die Spritegröße ist frei wählbar; die Standardwahl im Dialog richtet sich nach der Frame-Größe (auf die nächste verfügbare Größe aufgerundet, kleinere Frames werden aufgefüllt).
- Frames, die größer als die größte Spritegröße sind, passen nicht (siehe „Grenzen").

### PICO-8 (`.p8`)

- Palette: die 16 festen PICO-8-Farben (bereits als `PICO8` in `src/palette/palettes.ts`).
- Das Sprite-Blatt ist 128×128 Pixel, ein Hexzeichen pro Pixel (Farbindex 0–f), 128 Zeilen im Abschnitt `__gfx__`. Sprite `n` liegt in Zelle `(n % 16, n / 16)` mit 8×8 Pixeln.
- Die Datei enthält Kopfzeile (`pico-8 cartridge // http://www.pico-8.com`, `version 41` o. ä.), einen leeren `__lua__`-Abschnitt und den `__gfx__`-Abschnitt. Weitere Abschnitte sind nicht nötig. *(Umsetzer prüft anhand einer echten `.p8`, z. B. `D:\source\docs\MoodyPiano.p8`, welche Mindestform PICO-8 akzeptiert.)*
- Dateiname: `klexel.p8` o. ä.

### Picotron (`.gfx`)

- Palette: Picotron-Standardpalette, **64 Farben** (Index 0–63). Die RGB-Werte stehen weder in dieser Spec noch im Projekt: Der Umsetzer entnimmt sie dem Picotron-Handbuch und **prüft sie gegen die Beispieldatei** `D:\source\docs\0.gfx` bzw. gegen eine vom Nutzer in Picotron gezeichnete Referenzgrafik. Die Palette wird als Datentabelle im Projekt abgelegt.
- Dateiformat laut Beispieldatei `D:\source\docs\0.gfx` (vom Nutzer aus Picotron): Textkopf `--[[pod,created="…",modified="…",revision=N]]`, danach LZ4-komprimierter Pod mit einer Lua-Tabelle `{[0]={bmp=…,flags=0,pan_x=…,pan_y=…,zoom=…}, {…}, …}` mit **256 Einträgen** (Index 0–255); jedes `bmp` ist ein `u8`-Userdata (hier 16×16, 4-Bit-Index, Binärformat `pxu`). Leere Sprites sind sehr kurz (`f0 f0`).
- **Schreibweg (Annahme, muss zuerst geprüft werden):** Die Datei wird in **unkomprimierter Textform** geschrieben (`--[[pod]]` bzw. `--[[pod_format="raw"]]` gefolgt von der Tabelle mit `bmp=userdata("u8",w,h,"hex…")`). Bevor irgendetwas anderes gebaut wird, erzeugt der Umsetzer eine Testdatei und der Nutzer öffnet sie in Picotron. **Lädt Picotron sie nicht**, wird das komprimierte Format (LZ4 + `pxu`) aus der Beispieldatei nachgebaut; dieser Fall ist in der Planung als Verzweigung auszuweisen.
- Sprite 0 ist in Picotron-Karten als „leer" reserviert (in Maps nicht gezeichnet). Die Startnummer-Vorgabe 1 lässt sie frei. Wird Sprite 0 gewählt, genügt ein Hinweis.
- Dateiname: `0.gfx` o. ä. (führende Zahl für automatische Indizes).

## Grenzen (Export gesperrt oder abgeschnitten)

| Ziel | Grenze | Prüfung |
|------|--------|---------|
| PICO-8 | 256 Sprites (Nr. 0–255), Blatt 128×128; **gemeinsam nutzbarer Bereich** Sprites 128–255 teilt sich Platz mit der Map (kein Konflikt beim Neuanlegen, aber Hinweis, wenn über 128 hinaus belegt) | Anzahl und Position der Zellen |
| Picotron | 256 Sprites je `.gfx`-Datei | Anzahl |
| beide | Frame/Bild größer als Spritegröße bei „Frames als Sprites" und nicht aufteilbar (PICO-8: größer als 128×128; Picotron: größer als 32×32) | Frame-Maße |
| beide | Startnummer + Anzahl überschreitet die Grenze | Anzahl |

- **Gesperrt:** „Exportieren" ist deaktiviert, bis der Nutzer „Abschneiden" wählt oder Einstellungen ändert.
- **Abgeschnitten:** Überzählige Sprites (die letzten) bzw. überstehende Bildteile entfallen. Das Ergebnis wird in der Vorschau gezeigt, bevor exportiert wird.

## Code-Struktur (Vorschlag, Umsetzer darf anpassen)

- `src/palette/palettes.ts`: Picotron-Palette ergänzen; allgemeine Funktion „nächste Palettenfarbe + Menge angepasster Farben".
- `src/export/console/`: eine Datei je Ziel (`pico8.ts`, `picotron.ts`) plus gemeinsame Funktionen für Zuschnitt, Reduzierung und Grenzprüfung (`sprites.ts`). Reine Funktionen ohne DOM, damit testbar.
- `src/ui/consoleExportDialog.ts`: Dialog, Vorschau, Hinweise. Folgt dem Stil der vorhandenen Dialoge.
- Tests (Vitest, wie `state.test.ts`): Reduzierung (Abbildung, Zählung, Index-0-Regel), Zuschnitt (Rand, Nummerierung), PICO-8-`__gfx__` Ausgabe an einem bekannten kleinen Beispiel, Grenzprüfung (gesperrt/abgeschnitten), Picotron-Textform (gegen die Beispieldatei: Aufbau der Tabelle, 256 Einträge).

## Offen für den Umsetzer

- Exakte Picotron-Palettenwerte und Index-0-Verhalten (siehe oben).
- Ob Picotron die Textform lädt; bei Nein komprimiertes Format.
- Genauer Platz des Einstiegs in der Oberfläche.
- Bei PICO-8 zusätzlich Spritegrößen 16/32 als Block-Markierung (nur Hinweis, keine Funktion in v1).
