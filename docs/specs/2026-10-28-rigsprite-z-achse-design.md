# Rigsprite: Bewegung in der Tiefe (Z-Achse) – Design

Stand: 2026-10-28 · Projekt: Rigsprite-Bereich der Suite (`packages/rigsprite`) · Status: Entwurf, wartet auf Freigabe

## Ziel

Die Bones eines Rigs lassen sich auch **in die Tiefe** bewegen: Ein Bein, das beim Laufen auf die Kamera zu oder von ihr weg schwingt, wird auf dem Bildschirm kürzer und wandert nach oben. Die Sprites bleiben **flach in der Ebene ihres Bones** und verzerren sich durch die Projektion von selbst. Damit wirken Laufen, Springen und Ähnliches in der **Vorder- und Rückansicht** glaubwürdig, wo eine reine 2D-Drehung nicht ausreicht.

Auslöser: Die neuen Vorder- und Rückansicht-Vorlagen (Rig und Animationen) können Schwingbewegungen nach vorne und hinten heute nicht darstellen.

## Anti-Ziel

**Bestehende Projekte, Vorlagen und Bedienung ändern sich nicht.** Ohne Tiefenwerte (alle 0) ist das Ergebnis pixelgleich zu heute: gleiche Matrizen, gleiche Zeichenreihenfolge, gleicher Export. Alte `.rigsprite.json`-Dateien und Workspace-Stände laden weiter; das Projektformat wird nur additiv erweitert. Die bestehende Test-Suite bleibt grün und wird nicht abgeschwächt. Zusätzlich gelten die Leitplanken der Suite: kein Konto, kein Backend, mobile first (neue Bedienelemente per Touch erreichbar, mindestens 44 px).

## Entschieden (vom Nutzer)

- Gearbeitet wird in **einer festen Ansicht** (vorn, hinten oder seitlich). Ein **Drehen zwischen Ansichten** (z. B. Kurve, Dreiviertel) ist **nicht** Teil dieser Arbeit, soll aber später ergänzbar sein.
- Laufen und Springen (und Ähnliches) müssen in Vorder- und Rückansicht funktionieren.
- Kippen wird über **Regler im Inspektor** und einen **zusätzlichen Griff am Bone** auf der Zeichenfläche eingestellt.
- Die Z-Bewegung lässt sich **für das ganze Projekt sperren**.

## Nicht-Ziele

- Keine freie Kamera und kein Drehen der Figur im Raum; keine Perspektive.
- Keine Sprites in mehreren Ebenen oder Volumen; ein Sprite bleibt eine flache Fläche.
- Keine pixelgenaue Auflösung von Durchdringungen: Sortiert wird pro Teil, nicht pro Pixel.
- Keine Änderung am Austausch mit Klexel; gerendert werden weiter normale Frames.
- Keine Änderung der Seitenansicht-Vorlagen und ihrer Animationen.

## Verhalten

**Neue Bone-Werte (Pose, animierbar).** Zusätzlich zu Position, Rotation und Skalierung hat jeder Bone: *Kippen* (die Spitze des Bones schwingt zur Kamera hin oder von ihr weg; Drehung um die Querachse des Bones), *Drehen* (Drehung um die Bone-Achse selbst; bei einem nach unten zeigenden Bein die Hochachse) und *Tiefe* (Verschiebung zur Kamera hin oder von ihr weg). Alle starten bei 0. Sie wirken wie die bisherigen Werte entlang der Bone-Kette: Ein Kind-Bone folgt der Bewegung seines Elternteils.

**Projektion.** Orthografisch: Die Bildschirmposition ist x/y der 3D-Position, die Tiefe wird nur zum Sortieren benutzt. Die Sprites werden in ihrer Bone-Ebene verformt, wie es die Neigung ergibt (Kippen verkürzt senkrecht, Drehen verkürzt waagerecht). Sehr schmale Sprites bei fast 90° sind erwartetes Verhalten.

**Zeichenreihenfolge.** Teile werden nach ihrer Tiefe sortiert, vorne liegt vor hinten. Die bisherige Ebene `z` eines Teils entscheidet nur bei gleicher Tiefe. So wechselt ein schwingendes Bein sauber vor und hinter den Körper.

**Sperren.** Ein Schalter am Projekt schaltet Kippen, Drehen und Tiefe ab. Bei gesperrtem Projekt rechnen alle Bones und Ausgaben (Vorschau, Export) so, als wären die Werte 0. Die Werte und Tastenwerte bleiben erhalten und wirken wieder, sobald entsperrt wird. Der Sperr-Zustand wird mit dem Projekt gespeichert.

**Bedienung.** Der Inspektor bekommt Regler für die drei Werte (Touch-Ziele ≥ 44 px, numerische Eingabe wie bei den bisherigen Werten). Auf der Zeichenfläche bekommt der gewählte Bone einen zusätzlichen Griff, der Kippen setzt. Beides erzeugt wie bisher Tastenwerte im Animationsmodus und einen Undo-Schritt. Die Zeitleiste zeigt und bearbeitet die neuen Kanäle wie die bestehenden. Bei gesperrtem Projekt sind Regler und Griff deaktiviert, mit einem Hinweis, warum.

**Spätere Erweiterung.** *Drehen* ist als Kanal und in der Rechnung von Anfang an vollständig, wird aber zunächst nur über dieselbe Oberfläche wie die anderen Werte angeboten, ohne Ansichtswechsel, Zwischenansichten oder Animationen, die zwischen Ansichten blenden.

**Vorlagen.** Die Animationen der Vorder- und Rückansicht (Laufen, Springen, Idle) bekommen Tiefenwerte, sodass Beine und Arme zur Kamera hin schwingen. Die Rigs und Animationen der Seitenansicht bleiben unverändert.

**Export und Austausch.** Spritesheet-Export, Vorschau und die Rückgabe nach Klexel nutzen dieselbe Berechnung wie die Zeichenfläche und liefern bei gesperrtem Projekt oder Werten 0 dieselben Pixel wie bisher.

## Daten und Kompatibilität

- Neue optionale Tastenkanäle in der Animation und optionale Bone-Werte; fehlen sie, gelten 0. Das Projektformat bleibt lesbar für alte Dateien. Ob dafür die Format-Version erhöht wird, entscheidet der Plan; neue Dateien dürfen von älteren Ständen **nicht** stillschweigend mit verlorenen Tiefenwerten geladen werden (entweder Versionshinweis oder bewusst dokumentierter Verlust).
- Die Eigenschaft „gesperrt“ ist Teil des Projekts und wandert mit Workspace-Datei und `.rigsprite.json`.

## Was dem Bauenden überlassen bleibt

Interne Matrix-Darstellung (z. B. 4×4), Namen der Kanäle und der Oberfläche, Form und Platz des Griffs, Form des Sperr-Schalters, konkrete Tiefenwerte der Vorlagen-Animationen, Versionsstrategie des Formats.

## Prüfen (Abnahme)

- Ohne Tiefenwerte oder bei gesperrtem Projekt: Pixel-Vergleich mit dem Stand vor der Änderung für Zeichenfläche, Vorschau und Export bei den vorhandenen Vorlagen.
- Ein Bein mit gekipptem Oberschenkel zeigt kürzere Sprites; das Schienbein folgt der Kette.
- Reihenfolge wechselt, wenn ein Bein die Tiefe des Körpers kreuzt.
- Alte Dateien laden unverändert; neue Dateien speichern und laden die Werte und den Sperr-Zustand verlustfrei, auch über den Workspace.
- Vorder- und Rückansicht-Laufen und -Springen sehen mit Tiefe sichtbar glaubwürdiger aus als ohne (Sichtprüfung der Frames).
- Die Regler sind per Touch bedienbar.
