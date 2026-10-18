# Präzisionscursor mit Lupe und Pixel-perfect-Strich – Design

Stand: 2026-10-18 · Projekt: Klexel (`D:\source\repos\klexel`, `https://marikrogers.github.io/klexel/`) · Idee 5 aus `../ideen/2026-10-18-mobil-zeichenhilfen.md` · Referenz für das Gefühl der Bedienung: `../prototypen/prototyp-2-versatz-doppeltipp.html` (Wegwerf-Prototyp, nicht als Code übernehmen)

## Ziel

Auf dem Handy verdeckt der Finger beim Zeichnen genau das Pixel, das man treffen will. Klexel bekommt deshalb einen **Präzisionscursor**: ein Fadenkreuz, das **versetzt über dem Finger** liegt, dazu eine **Lupe**, die die Umgebung des Cursors vergrößert zeigt. Zusätzlich verhindert ein **Pixel-perfect-Strich** die kleinen L-Ecken, die beim Freihandzeichnen entstehen.

Der Präzisionscursor lässt sich **ein- und ausschalten**. Ausgeschaltet zeichnet Klexel wie bisher direkt unter dem Finger.

Entschieden (vom Nutzer, nach dem Ausprobieren zweier Prototypen): Es wird die Variante **„Versatz über dem Finger"** gebaut, nicht der Joystick. **Versatz 84 px** nach oben (CSS-Pixel), der Wert „ist super so". Die Lupe „sieht gut so aus" (Aufbau siehe unten). Zwischen **Bewegen** und **Zeichnen** wird **per Doppeltippen und zusätzlich über einen Button** umgeschaltet. Die **Händigkeit ist einstellbar** (Links/Rechts). **Pixel-perfect ist standardmäßig an.**

Aus dem Prototyp als Vermutung des Planers übernommen, vom Nutzer nur indirekt gesehen: Rechtshänder → Cursor liegt zusätzlich 28 px **links** vom Finger, Linkshänder → 28 px **rechts**; Doppeltipp-Zeiten (siehe „Bewegen und Zeichnen").

Nicht Teil dieser Spec:

- **Joystick-Steuerung.** Der Prototyp liegt unter `../prototypen/prototyp-1-joystick.html`. Er kann später als zweite Steuerungsart in den Einstellungen folgen (eigene Spec).
- **Gesten Zwei-Finger-Tippen = Undo, Drei-Finger-Tippen = Redo** aus der Ideensammlung. Zwei Finger bedeuten in Klexel bereits Verschieben und Zoomen; die Geste braucht eine eigene Spec, die diesen Konflikt löst.
- Einstellbarer Versatz (Länge) und einstellbare Lupengröße oder Lupenvergrößerung. Beides sind feste Werte.
- Präzisionscursor für das Werkzeug **Auswahl**.
- Alle übrigen Zeichenhilfen aus Idee 6 (Symmetrie, Kachelvorschau, Outline, Rampen, Dither).

## Bedienung

### Schalter und Einstellungen

- **Präzisionscursor an/aus.** Ein Schalter, der bei Touch-Bedienung jederzeit ohne Umweg erreichbar ist (Platz und Symbol entscheidet der Umsetzer; Touch-Ziel mindestens 44 px). Beim ersten Start **aus**, danach wird die Wahl gespeichert.
- **Hand: rechts/links.** Nur sichtbar, solange der Präzisionscursor an ist. Standard **rechts**. Wird gespeichert.
- **Pixel-perfect an/aus.** Standard **an**. Wird gespeichert. Wirkt unabhängig vom Präzisionscursor (siehe „Pixel-perfect-Strich").
- Die Einstellungen werden getrennt vom Dokument gespeichert. Fehlen sie (alter gespeicherter Stand), gelten die Standardwerte; **alte Stände laden unverändert**.

### Geltungsbereich

Entschieden (vom Nutzer): Der Präzisionscursor wirkt bei **Stift, Radierer, Linie, Rechteck, Ellipse, Füllen und Pipette**. Bei **Auswahl** (Rechteck, Lasso, Zauberstab) ist er **nicht sichtbar** und Klexel verhält sich wie bisher; der Schalter behält seinen Zustand. Auswahl mit Präzisionscursor ist eine Folge-Spec.

Was „Zeichnen" bei den einzelnen Werkzeugen bedeutet, steht unter „Bewegen und Zeichnen". Die Abläufe für Formen, Füllen und Pipette sind **Vorschläge des Planers** (nur Stift und Radierer wurden im Prototyp ausprobiert).

### Cursor

- Sobald der Präzisionscursor an ist und Stift oder Radierer gewählt sind, ist der Cursor sichtbar: ein **Fadenkreuz um ein Dokumentpixel** (weiß mit dunkler Kontur, damit es auf jedem Hintergrund lesbar ist). Im Modus **Zeichnen** ist es zusätzlich rot getönt, im Modus **Bewegen** nicht.
- **Position:** Berührt der Finger die Zeichenfläche an der Bildschirmstelle `(x, y)`, liegt der Cursor bei `(x ∓ 28, y − 84)` (CSS-Pixel; `−28` für Rechtshänder, `+28` für Linkshänder), umgerechnet ins Dokument, **auf die Dokumentgrenzen begrenzt**.
- Beim Aufsetzen **springt** der Cursor an diese Stelle; er hängt dann am Finger, bis dieser abgehoben wird. Nach dem Abheben **bleibt er stehen** und ist weiter sichtbar.
- Der Cursor zeigt das Pixel, das gesetzt würde. Das ist immer ein ganzes Dokumentpixel (kein Zwischenwert).
- Pointer-Capture bleibt wie bisher: Der Finger darf beim Ziehen die Zeichenfläche verlassen, der Cursor bleibt auf dem Dokument.

### Bewegen und Zeichnen

- **Bewegen:** Der Finger verschiebt nur den Cursor; es wird nichts gezeichnet, gefüllt oder aufgenommen. **Zeichnen:** je nach Werkzeug:
  - **Stift/Radierer:** Der Cursor zieht beim Verschieben einen Strich (Stift: aktuelle Farbe, Radierer: transparent); ein **einfacher Tipp setzt ein Pixel** am Cursor.
  - **Füllen und Pipette:** Die Aktion läuft **beim Abheben** am Cursorpixel ab (Füllen: Flächenfüllung wie bisher; Pipette: Farbe aufnehmen). So kann man mit dem Finger zielen, die Lupe nutzen und erst beim Loslassen auslösen. Ein einfacher Tipp löst ebenfalls aus. Pro Berührung gibt es höchstens eine Aktion.
  - **Linie, Rechteck, Ellipse:** Der Wechsel von Bewegen zu Zeichnen **setzt den Anker** (erste Ecke) an der aktuellen Cursorposition. Im Modus Zeichnen bewegt der Finger die zweite Ecke (der Cursor); die Form erscheint live als Vorschau (wie bisher). Abheben lässt die Vorschau stehen, erneutes Aufsetzen bewegt die zweite Ecke weiter. Der Wechsel **zurück zu Bewegen übernimmt die Form** (ein Undo-Schritt). Ein Werkzeugwechsel oder ein zweiter Finger **verwirft** die Vorschau. So lässt sich auch die erste Ecke mit Lupe genau setzen, bevor man sie festlegt.
- **Umschalten:** (a) **Doppeltippen** auf der Zeichenfläche, (b) ein **Button** („Bewegen"/„Zeichnen", zeigt zugleich den aktuellen Modus an, Touch-Ziel mindestens 44 px, nur sichtbar, solange der Cursor sichtbar ist). Beim Umschalten erscheint kurz ein Hinweis („Zeichenmodus AN"/„AUS").
- **Doppeltipp** (Werte aus dem Prototyp, als Konstanten an einem Ort): zwei Tipps, die jeweils kürzer als 300 ms dauern und sich weniger als `TAP_THRESHOLD_PX` (6 px, `src/edit/gestures.ts`) bewegen, höchstens 350 ms auseinander und weniger als 50 px voneinander entfernt.
- **Ein Doppeltipp darf außer dem Moduswechsel keine Spur hinterlassen.** Im Modus Zeichnen löst der erste Tipp bei Stift, Radierer, Füllen und Pipette bereits etwas aus (Pixel, Füllung, aufgenommene Farbe); wird er als Teil eines Doppeltipps erkannt, wird das **zurückgenommen** (kein Eintrag in der History, bei der Pipette wird die vorherige Farbe wiederhergestellt). Der zweite Tipp löst nichts aus.
- Die Tippe eines Doppeltipps **bewegen den Cursor** an die Tippstelle (wie jede Berührung). Wer den Cursor nicht verschieben will, nimmt den Button.
- Beim **Start** von Klexel ist der Modus immer **Bewegen**; er wird nicht gespeichert. Der Modus bleibt beim Abheben und beim Werkzeugwechsel Stift ↔ Radierer erhalten.
- **History:** Ein Strich (vom Aufsetzen bis zum Abheben im Modus Zeichnen) ist **ein** Undo-Schritt; ein Tipp, der ein Pixel setzt, ebenfalls; eine Füllung ist einer, eine übernommene Form ist einer. Bewegen, Umschalten, Pipette und Vorschau erzeugen keine History-Einträge.
- Bei **Pipette** und **Füllen** gelten weiter die bisherigen Regeln (gesperrte oder ausgeblendete Ebene → Hinweis statt Aktion, `doc.drawBlockReason()`), ebenso bei allen übrigen Werkzeugen mit Präzisionscursor.

### Zwei Finger, Zoom und Verschieben

- Die vorhandene Geste mit zwei Fingern (Verschieben und Zoomen) bleibt unverändert und hat Vorrang. Wie bisher verwirft ein zweiter Finger einen laufenden Strich (`endStroke(false)`). Der Cursor behält dabei seine Dokumentposition.
- Wegen des Versatzes erreicht der Finger die oberste Zeile der **sichtbaren** Fläche nicht mit dem Cursor (84 px). Der Nutzer verschiebt dazu die Ansicht, wie er es sonst auch tut. Der Umsetzer prüft, dass die Ansicht sich weit genug verschieben lässt, damit jede Zeile und Spalte des Dokuments erreichbar ist, und ergänzt bei Bedarf einen Rand.

### Lupe

- Zeigt **9×9 Dokumentpixel** um den Cursor, **12 px pro Pixel** (108 px Kantenlänge, CSS), mit Rahmen; das Mittelpixel (das Cursorpixel) ist markiert, im Modus Zeichnen rot, sonst in der Akzentfarbe. Außerhalb des Dokuments erscheint ein dunkles Feld.
- Gezeigt wird das **zusammengerechnete Bild** (sichtbare Ebenen), live auch während eines Striches.
- **Position:** oben links in der Zeichenfläche. Liegt der Cursor (samt Fadenkreuz-Armen und ca. 20 px Rand) im Bereich der Lupe, wechselt sie nach **oben rechts**. Sie fängt keine Berührungen ab (`pointer-events: none`).
- Sichtbar genau dann, wenn der Cursor sichtbar ist.

### Pixel-perfect-Strich

- Beim Freihandzeichnen mit **Stift und Radierer** (mit und ohne Präzisionscursor) entfernt Klexel das mittlere Pixel einer **L-Ecke**: Drei aufeinanderfolgende Strichpixel `A`, `B`, `C`, bei denen `A` und `C` diagonal benachbart sind und `B` zugleich orthogonal an beide grenzt, ergeben ohne `B` eine saubere Diagonale. Dadurch bleibt der Strich überall ein Pixel breit.

  ```
  ohne:        mit:
  ##.          #..
  .##          .#.
  ..#          ..#
  ```

- Die Entscheidung fällt erst, wenn das nächste Strichpixel bekannt ist; die Darstellung darf ein Pixel nachlaufen. Beim Abheben bleibt das zuletzt gesetzte Pixel stehen.
- Entfernt wird `B` nur, wenn es **in diesem Strich** gesetzt wurde: Sein Wert wird auf den Zustand **vor dem Strich** zurückgesetzt (nicht auf Transparenz oder die aktuelle Farbe). Bereits vorhandene Pixel, die der Strich nur überfahren hat, werden dadurch nicht beschädigt.
- Gilt nicht für Linie, Rechteck, Ellipse, Füllen und Pipette, und nicht für einen einzelnen Tipp.
- Der Schalter „Pixel-perfect" schaltet dieses Verhalten aus; dann entsteht der Strich wie bisher (`linePoints` zwischen den Zeigerpositionen).

## Code-Struktur (Vorschlag, Umsetzer darf anpassen)

Vorhandene Anknüpfungspunkte: `src/main.ts` (`pointerdown`/`pointermove`/`pointerup`, `apply`, `endStroke`, `local`, `view.toDoc`), `src/edit/gestures.ts` (`TAP_THRESHOLD_PX`), `src/tools/line.ts` (`linePoints`), `src/model/History.ts` (`begin`/`set`/`commit`/`cancel`), `src/storage/` (Einstellungen), `src/render/Viewport.ts` (Zeichnen von Cursor und Lupe, sonst eigenes Overlay-Element).

Reine, in Node testbare Bausteine (kein DOM):

- `src/precision/cursorMap.ts`: Bildschirmposition + Hand + Viewport → Cursorpixel (Versatz, Umrechnung, Begrenzung).
- `src/precision/doubleTap.ts`: kleiner Zustandsautomat mit **übergebener Zeit** (kein `Date.now()` im Kern), Eingaben „down/move/up mit Position und Zeit", Ausgabe „Tipp", „Doppeltipp", „Strich".
- `src/precision/loupe.ts`: Lupenposition (links/rechts) aus Cursorlage; Ausschnitt 9×9 mit Rand.
- `src/draw/pixelPerfect.ts`: Filter über die Folge der Strichpixel; liefert, welche Pixel zu setzen bzw. zurückzusetzen sind. Muss mit der History zusammenarbeiten (Zurücksetzen auf den Wert vor dem Strich innerhalb einer offenen Transaktion).
- `src/ui/precisionControls.ts`: Schalter, Händigkeit, Modus-Button, Hinweis; `main.ts` verdrahtet nur.

Tests (Vitest, Node):

- **cursorMap:** Rechts- und Linkshänder, Begrenzung an allen vier Rändern, bei Zoom 1× und größer, bei verschobener Ansicht.
- **doubleTap:** zwei kurze Tipps → Doppeltipp; zu langsam (351 ms), zu weit auseinander (50 px), zu lange gehalten (300 ms), Bewegung über der Schwelle → Strich statt Tipp; dritter Tipp direkt nach einem Doppeltipp gilt als neuer erster Tipp.
- **Doppeltipp ohne Spur:** im Modus Zeichnen bleibt nach einem Doppeltipp das Dokument unverändert und die History leer; bei Füllen ebenso, bei Pipette ist die Farbe wieder die vorherige.
- **Formen:** Anker beim Wechsel zu Zeichnen, Vorschau folgt der zweiten Ecke, Wechsel zu Bewegen übernimmt (ein Undo-Schritt), Werkzeugwechsel und zweiter Finger verwerfen.
- **Füllen/Pipette:** Auslösung beim Abheben, höchstens eine Aktion pro Berührung, nichts im Modus Bewegen.
- **pixelPerfect:** gerade Linien unverändert, Treppe aus L-Ecken wird zur Diagonale, Rückkehr zur Ausgangsrichtung, kurze Striche (1, 2, 3 Pixel), Strich über vorhandene Pixel (Wiederherstellen des Wertes vor dem Strich), Radierer.
- **loupe:** Wechsel links ↔ rechts an den Schwellen, Ausschnitt am Dokumentrand (Felder außerhalb).
- Einstellungen: Standardwerte bei fehlendem Eintrag; alte Stände laden.

## Offen für den Umsetzer

- Platz und Symbol von Schalter, Händigkeit und Modus-Button in der vorhandenen Werkzeugleiste.
- Ob Cursor und Lupe auf dem bestehenden Canvas (`Viewport`) gezeichnet werden oder als eigenes Overlay; ob Lupe und Cursor beim Zoom ≥ einer bestimmten Stufe weiter sinnvoll sind (bei sehr hohem Zoom erreicht man ohnehin jedes Pixel direkt).
- Ob der Rand für das Erreichen der obersten Zeile eine Änderung am Verschiebebereich der Ansicht braucht (siehe „Zwei Finger, Zoom und Verschieben").
- Feinabstimmung der festen Werte (Versatz 84/28 px, Lupe 9×9 mit 12 px, Doppeltippzeiten) nach dem Ausprobieren auf echten Geräten; sie gehören als Konstanten an einen Ort.
- Wortlaut der Hinweise im Rahmen der oben genannten.
