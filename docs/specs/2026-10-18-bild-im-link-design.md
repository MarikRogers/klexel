# Bild im Link teilen – Design

Stand: 2026-10-18 · Projekt: Pixelart-PWA (`D:\source\docs\pixelart`, veröffentlicht als Klexel unter `https://marikrogers.github.io/klexel/`) · Idee 3 aus `../ideen/2026-10-18-werkbank.md` · nutzt `docBelegt`-Logik aus `2026-10-18-foto-zu-pixelart-design.md` (`src/photo/hasContent.ts`)

## Ziel

Ein fertiges Sprite lässt sich **ohne Server und ohne Konto** als Link verschicken (Messenger o. ä.). Wer den Link öffnet, sieht das Bild in Klexel und kann es als PNG speichern oder in Klexel bearbeiten („Remix"). Das Bild steckt vollständig im Link; es gibt kein Backend und keine Datenübertragung an einen Server.

Entschieden (vom Nutzer): Anlass ist das Verschicken an eine Person per Messenger. Beim Öffnen zeigt Klexel eine **Vorschau mit zwei Schaltflächen**, „PNG speichern" und „In Klexel bearbeiten"; eigene Arbeit des Empfängers wird erst nach Rückfrage ersetzt. **Erste Version:** nur ein **flaches Bild**, bis **64×64** und bis **32 Farben**. Wird der Link zu lang, zeigt Klexel das an, und „PNG speichern" bleibt als Ausweg. **Animationen (Frames) kommen später** (eigene Spec), das Format ist dafür erweiterbar. Bestätigt (vom Nutzer, als Vermutung vorgelegt): Button „Link teilen" beim Absender mit Linklänge und Kopieren/Teilen; Bild im Teil des Links nach `#`; Format mit Palette, Pixelindizes und Versionsnummer; Transparenz bleibt erhalten; zu viele Farben oder zu große Bilder bekommen keinen Link, sondern den Hinweis auf „PNG speichern"; kaputte Links zeigen eine verständliche Meldung.

Nicht Teil dieser Spec: Frames/Animationen, Ebenen, QR-Codes, Link-Kürzer, Server oder Konto, Teilen direkt an bestimmte Apps (es genügt `navigator.share` und Kopieren), automatisches Farbreduzieren beim Teilen (das übernimmt die Foto-Funktion), Verschlüsselung.

## Bedienung

### Absender

- Neuer Button **„Link teilen"** in der Dateizeile (Symbol und Platz wie die vorhandenen Buttons, Umsetzer entscheidet). Er öffnet einen **Dialog** im Stil der vorhandenen (Touch-Größen mindestens 44 px).
- Geteilt wird das **zusammengerechnete Bild des aktuellen Frames** (sichtbare Ebenen, wie der PNG-Export).
- Der Dialog zeigt: eine Vorschau des Bildes, die **Linklänge in Zeichen** (volle URL) und einen Status:
  - **Länge ≤ 2000:** grün/neutral, „Link bereit".
  - **2001–4000:** Warnung „Der Link ist lang und kommt in manchen Messengern möglicherweise nicht vollständig an."
  - **> 4000, mehr als 32 Farben, größer als 64×64 oder ganz leeres Bild:** **kein Link**. Der Dialog erklärt den Grund („zu lang", „mehr als 32 Farben (N)", „größer als 64×64", „das Bild ist leer") und verweist auf „PNG speichern" (der vorhandene PNG-Export bleibt unverändert).
- Schaltflächen bei vorhandenem Link: **„Link teilen"** (öffnet `navigator.share({ url })`, nur sichtbar, wenn der Browser das kann), **„Link kopieren"** (Zwischenablage, danach Hinweis „Link kopiert"), **„Schließen"**.
- Der Link wird beim Öffnen des Dialogs neu aus dem aktuellen Bild berechnet.

### Empfänger

- Beim Start der Seite wird, falls der Teil nach `#` einen Klexel-Link-Wert enthält (siehe Format), das Bild gelesen und ein **Dialog** gezeigt: Vorschau (pixelscharf vergrößert, Transparenz sichtbar), Größe in Pixeln, Anzahl Farben und die Schaltflächen:
  - **„PNG speichern"** lädt das Bild als `klexel.png` über `saveBlob` (Skalierung wie der PNG-Export: `max(1, floor(512 / max(w, h)))`).
  - **„In Klexel bearbeiten"** ersetzt das aktuelle Bild durch das gelesene (eine Ebene, ein Frame, neue History). Ist das aktuelle Bild nicht leer (`docHasContent`), erscheint vorher **„Das aktuelle Bild wird ersetzt. Fortfahren?"**; bei Abbruch bleibt der Dialog offen.
  - **„Schließen"**.
- Nach dem Schließen des Dialogs (egal wodurch) wird der `#`-Teil aus der Adresszeile entfernt (`history.replaceState`), damit ein Neuladen den Dialog nicht erneut öffnet. Die Farbfelder von Klexel bleiben unverändert.
- Der Dialog erscheint nach dem normalen Start (nicht vor dem Laden des gespeicherten Standes), und das bisherige Dokument bleibt bis zu „In Klexel bearbeiten" unberührt.
- **Fehler:** Ist der Wert beschädigt oder unvollständig, erscheint **„Der Link ist beschädigt oder unvollständig."**; stammt er von einer neueren Formatversion, **„Dieser Link stammt von einer neueren Version von Klexel. Bitte Klexel aktualisieren."** In beiden Fällen bleibt das Dokument unverändert.

## Format

- **Link:** `<Basis>#i=<Wert>`. `<Basis>` ist die Adresse der laufenden Seite ohne `#` und Suchteil (`new URL('./', location.href)` bzw. gleichwertig), damit es lokal und veröffentlicht gleich funktioniert. `<Wert>` ist **Base64url** (Zeichen `A–Z a–z 0–9 - _`, ohne Auffüllzeichen).
- **Inhalt (Bytes, vor Base64url):**
  1. Byte 0: **Formatversion**, in dieser Version `1`.
  2. Byte 1: **Flags**. Bit 0: das Bild enthält Transparenz. Bit 1: der Rest (ab Byte 2) ist **deflate-raw-komprimiert**. Alle anderen Bits `0`.
  3. Rest (nach eventueller Dekompression): `w` (1 Byte, 1–64), `h` (1 Byte, 1–64), `n` (1 Byte, Anzahl deckender Palettenfarben, 0–32), danach `n` mal RGB (3 Bytes), danach die **Pixel** als Indizes, dicht gepackt (MSB zuerst, zeilenweise, links→rechts, oben→unten), je Pixel `bits = ceil(log2(n + t))` Bit mit `t = 1`, wenn Transparenz vorhanden ist, sonst `0`; bei `n + t ≤ 1` sind es 0 Bit (kein Pixelteil). Mit Transparenz ist **Index 0 transparent** und Farbe `k` (1-basiert) ist Palettenfarbe `k − 1`; ohne Transparenz ist Index `k` Palettenfarbe `k`.
- Die Kompression wird nur gesetzt, wenn sie den Wert kürzer macht und `CompressionStream` verfügbar ist; der Empfänger liest beide Varianten (bei nicht verfügbarem `DecompressionStream` und gesetztem Bit 1: Meldung „Dein Browser kann diesen Link nicht lesen.").
- **Farben:** Pixel mit Alpha < 128 sind transparent, alle anderen deckend (Alpha wird 255, Halbtransparenz geht verloren). Die Palette besteht aus den **verschiedenen RGB-Werten der deckenden Pixel** in der Reihenfolge ihres ersten Auftretens (zeilenweise). Dieselbe Eingabe ergibt immer denselben Link.
- Der Empfänger prüft strikt: gültiges Base64url, Version bekannt, `1 ≤ w,h ≤ 64`, `n ≤ 32`, Länge des Pixelteils passt genau, jeder Index in Reichweite, keine nicht gesetzten Flag-Bits. Alles andere zählt als „beschädigt".

## Code-Struktur (Vorschlag, Umsetzer darf anpassen)

- `src/share/linkCodec.ts`: reine Funktionen `encodeImage(width, height, pixels): Uint8Array | LinkProblem`, `decodeImage(bytes): DecodedImage | LinkError`, Base64url-Hilfen, Zusammensetzen und Lesen der URL. Kompression asynchron über `CompressionStream`/`DecompressionStream` in einer dünnen Schicht, damit der Kern synchron und in Node testbar bleibt.
- `src/ui/shareDialog.ts` (Absender), `src/ui/linkOpenDialog.ts` (Empfänger); `main.ts` verdrahtet Button, Start-Auswertung von `location.hash` und `attach`.
- Tests (Vitest, Node): Rundlauf mehrerer Bilder (1×1, 16×16, 64×64, mit und ohne Transparenz, 1 Farbe, 32 Farben), gleiche Eingabe → gleicher Link, Größe/Farben-Grenzen (65 breit, 33 Farben → Problem), Bitbreiten (n+t = 1, 2, 3, 17, 33), leeres Bild, Fehlerfälle (abgeschnittener Wert, falsche Version, ungültige Zeichen, Index außerhalb, überzählige Bytes), Linklängen an Beispielen (16×16 und 64×64 ≈ wie in der Schätzung).

## Offen für den Umsetzer

- Genauer Platz und Symbol des Buttons; Wortlaut der Texte im Rahmen der oben genannten.
- Ob `deflate-raw` in den unterstützten Browsern verlässlich verfügbar ist; falls nicht, bleibt das Format ohne Kompression gültig.
- Wie der Empfängerdialog beim Start ausgelöst wird, ohne den Startablauf (`loadState`) zu stören.
- Ob die Schwellen 2000/4000 für Messenger in der Praxis passen (sie sind Schätzungen des Planers, nicht gemessen); sie gehören als Konstanten an einen Ort.
