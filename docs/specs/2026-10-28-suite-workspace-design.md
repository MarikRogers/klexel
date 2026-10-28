# Suite aus Klexel und Rigsprite mit Workspace – Design

Stand: 2026-10-28 · Projekt: Pixelart-PWA Klexel (`D:\source\repos\klexel`) und Rigsprite (`D:\source\repos\rigsprite`) · Status: Freigegeben, umgesetzt (Branches feature/workspace-projekte, feature/suite-rigsprite, feature/suite-austausch)

## Ziel

Klexel (Pixelart zeichnen) und Rigsprite (Sprites an ein Skelett hängen, animieren, als Spritesheet exportieren) werden **eine App mit zwei erkennbar getrennten Bereichen**. Beide arbeiten in einem gemeinsamen **Workspace**, der **mehrere Projekte** enthält und sich als Datei sichern und laden lässt.

Der typische Ablauf des Nutzers: Er zeichnet in Klexel ein Dokument, dessen **Frames die Körperteile** sind. Rigsprite nimmt diese Frames als Sprites, er baut das Rig und animiert. Die fertige Animation geht als **Kopie** zurück nach Klexel, wo er die einzelnen Bilder nachbearbeitet. Ändert er in Klexel ein Körperteil, sieht Rigsprite die neue Version, ohne dass Rig, Zuordnung und Animationen verloren gehen.

Auslöser heute: Es gibt in beiden Programmen nur ein einziges Dokument (Klexel: IndexedDB `pixelart`/`kv`/`current`; Rigsprite: idb-keyval `rigsprite:autosave`), und der Weg dazwischen ist eine Datei, die man von Hand speichert und lädt.

## Anti-Ziel (wichtigste Leitplanke)

**Die Funktionsweise beider Anwendungen darf durch die Zusammenführung nicht eingeschränkt werden.** Alles, was Klexel und Rigsprite heute können, bleibt in Umfang, Bedienung und Ergebnis erhalten (Zeichenwerkzeuge, Ebenen, Frames, Auswahl, Export, Foto, Link; Rig, Orbit-Kamera, Timeline, Spritesheet-Export, Undo). Ausgenommen sind nur die bewusst geänderten Stellen dieser Spec (Speicherort, Einstiegspunkte). Zusätzlich:

- Alte gespeicherte Stände müssen weiter laden (Klexel-Stand im Browser inkl. früherer `version`-Stufen, `.rigsprite.json`). Sie werden nicht verworfen, sondern beim ersten Start in den Workspace übernommen.
- Die Roadmap-Leitplanken gelten weiter: kein Konto, kein Backend, keine Cloud, alles lokal oder im Link; mobile first (neue Bedienelemente per Touch erreichbar, mindestens 44 px).
- Die bestehende Test-Suite beider Programme bleibt grün und wird nicht abgeschwächt.

## Entschieden (vom Nutzer)

- Zwei Bereiche in **einer App**, als eigenständige Bereiche erkennbar. Jeder lässt sich **für das Deployment einzeln abschalten**.
- Ein Körperteil ist **ein Frame** eines Klexel-Dokuments.
- Der Rückweg Rigsprite → Klexel erzeugt eine **unabhängige Kopie**; erneutes Zurückgeben erzeugt eine neue Kopie und überschreibt Nacharbeit nicht.
- Projekte werden an **Name und optionaler Vorschau** erkannt; **schnelles Wechseln ohne Datenverlust** ist der Hauptnutzen. Es können **viele Projekte** werden.
- **Ein Workspace** im Browser, den man als Datei sichern und laden kann (mehrere Workspaces nebeneinander sind kein Ziel).

## Nicht-Ziele

- Kein Konto, keine Synchronisation zwischen Geräten, keine Zusammenarbeit.
- Keine mehreren Workspaces nebeneinander.
- Kein Live-Rückkanal Rigsprite → Klexel (die Kopie bleibt unabhängig).
- Keine Umstellung eines der Programme auf das Framework des anderen (Klexel bleibt Vanilla-TypeScript, Rigsprite bleibt React), solange es nicht nötig wird.
- Keine neuen Zeichen- oder Rig-Funktionen. Projekt-Browser/Paletten-Modell der Roadmap werden nur so weit berührt, wie die Projektliste es braucht.

## Bausteine

### Gemeinsame Schicht (neu, klein, ohne Abhängigkeit von Klexel oder Rigsprite)

- **Workspace:** Liste von Projekten mit Metadaten (ID, Art `klexel` | `rigsprite`, Name, Änderungsdatum, optionale Vorschau als kleines PNG), plus Verweis auf das zuletzt geöffnete Projekt.
- **Projektspeicher:** Jedes Projekt wird **einzeln** im Browser abgelegt (IndexedDB) und erst beim Öffnen geladen. Die Liste liest nur Metadaten, damit sie auch bei vielen Projekten flott bleibt.
- **Autosave pro Projekt:** Beim Wechseln, Schließen und Verlassen der Seite wird das aktuelle Projekt gesichert; ein Wechsel verliert keine Änderung.
- **Sprite-Kennung:** `{ projectId, frameId }`. Die Frame-ID existiert in Klexel bereits (`Frame.id`) und ist innerhalb eines Dokuments stabil.
- **Datei:** Der ganze Workspace oder einzelne Projekte lassen sich als Datei exportieren und importieren. Das Format ist versioniert; Projekte darin behalten ihr eigenes Format (Klexel-`SavedState`, Rigsprite-`Project`), damit alte Stände ladbar bleiben.

### Klexel-Bereich

- Verhalten wie bisher; ein Klexel-Projekt ist ein bisheriges Dokument (Ebenen, Frames, Palette, aktuelle Farbe).
- **Frame-Namen:** Frames bekommen optional einen Namen (heute keiner), damit Rigsprite wie bisher per Namen an Knochen zuordnen kann (`upperArm_L`). Alte Dokumente ohne Namen laden unverändert.
- Neue Aktion „An Rigsprite senden/als Sprites verwenden" und Annahme einer Animation als neues Dokument (siehe Austausch).

### Rigsprite-Bereich

- Verhalten wie bisher; ein Rigsprite-Projekt ist ein bisheriges `Project`.
- Bilder (`project.images`) können auf eine **Sprite-Kennung** verweisen (Klexel-Frame) statt nur auf eingebettete Pixel. Rigsprite löst die Kennung zu einem PNG auf (zusammengerechnetes Bild des Frames, wie der PNG-Export) und aktualisiert das Bild, wenn sich der Frame geändert hat. `parts`, Knochen-Zuordnung, Animationen und Einstellungen bleiben dabei unberührt.
- Bilder ohne Kennung (hochgeladene PNG/JPG/WebP, Spritesheet-Import) funktionieren unverändert. Die Quelle bleibt eine eingebettete Data-URL, sodass `.rigsprite.json` allein weiterhin vollständig ist.
- Ist die Quelle eines verknüpften Bildes nicht mehr da (Dokument oder Frame gelöscht), bleibt das zuletzt bekannte Bild erhalten und wird als „Quelle fehlt" gekennzeichnet.

### Hülle

- Dünne App-Hülle: Bereichswechsel (Klexel | Rigsprite), Projektliste, Projekt anlegen/umbenennen/duplizieren/löschen (Löschen mit Rückfrage), Wechseln zwischen Projekten.
- Beide Bereiche werden **bei Bedarf geladen** (dynamischer Import). Die Hülle kennt sie nur über eine schmale Schnittstelle (Name, Art, Projekt öffnen/sichern/Vorschau, Menüeinträge), sodass sich ein Bereich entfernen lässt, ohne den anderen anzufassen.
- Je ein eigener Bildschirmbereich mit eigener Kopfleiste, damit beide erkennbar getrennt bleiben. Die Styles beider Bereiche dürfen sich nicht gegenseitig beeinflussen (Klexel nutzt globale Styles).

### Abschaltbar beim Deployment

- Eine Einstellung beim Bauen (z. B. Umgebungsvariable) wählt die enthaltenen Bereiche (`klexel`, `rigsprite` oder beide). Ein abgeschalteter Bereich ist **nicht im Bundle** und nicht im Service-Worker-Cache, seine Menüeinträge und Projekt-Arten fehlen.
- Mit nur `klexel` verhält sich die App wie das heutige Klexel (plus Projektliste); mit nur `rigsprite` wie das heutige Rigsprite (plus Projektliste). Workspace-Dateien mit Projekten eines abgeschalteten Bereichs lassen sich laden, die Projekte bleiben erhalten, sind aber nicht öffenbar und sind klar gekennzeichnet (kein stilles Verwerfen).
- `npm run deploy` (GitHub Pages) bleibt der Deploy-Weg; welche Bereiche enthalten sind, ist beim Aufruf wählbar.

## Austausch

### Klexel → Rigsprite

- Quelle ist ein Klexel-Dokument; jeder Frame wird ein Sprite. Das Sprite-Bild ist das zusammengerechnete Bild des Frames (sichtbare Ebenen) in Originalgröße.
- Rigsprite legt zu jedem Frame ein Bild an (Name = Frame-Name, sonst „Frame N") und ordnet wie beim bisherigen Datei-Import automatisch per Namen an Knochen zu.
- Wird ein Frame in Klexel geändert, aktualisiert Rigsprite beim nächsten Öffnen/Wechsel das Bild. Hinzugekommene Frames erscheinen als neue Bilder; entfernte siehe oben.

### Rigsprite → Klexel

- Eine gewählte Animation wird als **neues Klexel-Dokument** abgelegt: ein Frame pro Animationsbild, `fps` aus der Animation, eine Ebene.
- Die Größe richtet sich nach den Export-Grenzen der Animation (gemeinsamer Pivot, einheitliche Framegröße wie beim Spritesheet-Export). **Klexel erlaubt höchstens 128×128 und 64 Frames**; übersteigt die Animation das, zeigt Rigsprite eine **Warnung** und bietet einen **kleineren Maßstab** oder einen **Frame-Bereich** an (entschieden vom Nutzer). Nie stillschweigend beschneiden oder skalieren; ohne gewählte Lösung wird nichts angelegt. Das Skalierverfahren (Nearest-Neighbor, um Pixelart nicht zu verfälschen) legt der Plan fest.
- Das Dokument merkt sich nur als Hinweis, aus welchem Rig und welcher Animation es stammt. Es ist danach unabhängig; weitere Rückgaben erzeugen neue Dokumente.

## Übernahme des Bestands

- **Entschieden (vom Nutzer):** Die Suite läuft unter der Klexel-Adresse. Den Browser-Speicher des alten Rigsprite (andere Adresse) kann sie nicht lesen; der Umzug geschieht einmalig über Speichern als `.rigsprite.json` im alten Rigsprite und Laden in der Suite. Das alte Rigsprite bekommt keine Übernahme-Hilfe.
- Beim ersten Start der Suite wird der vorhandene Klexel-Stand (`pixelart`/`kv`/`current`) als Projekt in den Workspace übernommen (ein Rigsprite-Autosave nur, falls er unter derselben Adresse liegt). Die alten Einträge bleiben zunächst bestehen, bis die Übernahme bestätigt gelesen wurde (nicht verlustbehaftet, nicht doppelt bei erneutem Start).
- Klexels „Neu" legt künftig ein neues Projekt an, statt das aktuelle zu ersetzen.
- Link-Teilen (Bild im Link) und Foto→Pixelart funktionieren unverändert; „In Klexel bearbeiten" aus einem Link legt ein neues Projekt an und fragt nicht mehr nach Ersetzen, wenn das aktuelle Projekt dadurch nicht verloren geht.

## Reihenfolge (Teilprojekte)

1. **Workspace und Projektverwaltung** mit Klexel allein: Projektliste, Wechseln, Autosave pro Projekt, Übernahme des Bestands, Datei-Export/-Import.
2. **Rigsprite als zweiter Bereich:** Einbindung, Bereichswechsel, Abschalten per Build-Einstellung, getrennte Styles, Projekt-Art `rigsprite`.
3. **Austausch:** Frame-Namen, Sprite-Kennungen und Aktualisieren, Rückgabe der Animation als Klexel-Dokument.

Jeder Schritt muss für sich lauffähig und ausgeliefert werden können, ohne Funktionen der Programme zu verlieren.

## Aufbau (Entscheidung des Entwurfs, nicht des Nutzers)

- Ein Repository mit gemeinsamer Schicht, Klexel-Paket, Rigsprite-Paket und Hülle (z. B. npm-Workspaces).
- **Entschieden (vom Nutzer): Das eigenständige Rigsprite (`D:\source\repos\rigsprite`, `MarikRogers/rigsprite`) bleibt unverändert bestehen.** Die Suite bekommt ihre eigene Übernahme des Rigsprite-Codes (Kopie bzw. Import ins Suite-Repo); am Original-Repo wird nichts verschoben, gelöscht oder umgebaut. Wie der Code übernommen wird (Kopie mit Herkunftsvermerk, `git subtree` o. Ä.) und wie spätere Änderungen am Original in die Suite gelangen, legt der Plan fest.
- Klexel bleibt Vanilla-TypeScript; Rigsprite bleibt React. Die Hülle ist framework-neutral (reine DOM-Container, in die die Bereiche rendern).

## Kleinere Festlegungen des Entwurfs (meine Entscheidungen, noch nicht vom Nutzer bestätigt)

- **Größenordnung:** Die Projektliste ist auf einige hundert Projekte ausgelegt. Metadaten (Name, Datum, Vorschau) liegen getrennt von den Projektdaten; die Liste lädt nur Metadaten. Suche und Sortierung nach Datum/Name genügen, keine Virtualisierung nötig.
- **Undo/Redo:** bleibt pro geöffnetem Projekt im Arbeitsspeicher; beim Wechseln wird das Projekt gesichert und der Undo-Verlauf des Projekts verworfen. Nach dem Wiederöffnen beginnt der Verlauf leer. (Das gilt auch heute nach einem Neuladen.)
- **Frame-Bild für Rigsprite:** Das Zusammenrechnen eines Frames (sichtbare Ebenen) liegt als reine Funktion ohne DOM in der gemeinsamen Schicht, damit Rigsprite nicht von Klexel abhängt. Der Abgleich läuft beim Öffnen eines Rigsprite-Projekts und beim Bereichswechsel. Ist Klexel nicht gebaut, bleiben verknüpfte Bilder als eingebettete Data-URL erhalten und werden nicht aktualisiert.
- **Aktualisieren und Zuordnung:** Das Aktualisieren ändert nur die Pixel des Bildes (und bei neuen Frames legt es neue Bilder an). Bereits gesetzte Zuordnungen zu Knochen bleiben unberührt; die automatische Zuordnung nach Namen läuft nur für neu hinzugekommene Bilder. Nach Umbenennen eines Frames in Klexel bleibt die Zuordnung bestehen.
- **Duplizieren eines Klexel-Projekts:** Das Duplikat bekommt eine neue Projekt-ID; bestehende Rigsprite-Verknüpfungen zeigen weiter auf das Original.
- **Import von Workspace-/Projektdateien:** Importierte Projekte werden immer als **neue** Projekte hinzugefügt (neue IDs, Verknüpfungen innerhalb der Datei werden mitumgeschrieben). Es wird nichts ersetzt und nichts zusammengeführt. Die Datei „Ganzer Workspace" legt zusätzlich einen neuen Workspace nicht an, sondern fügt die Projekte dem bestehenden hinzu.
- **Alte Einträge nach der Übernahme:** bleiben bestehen und werden nicht gelöscht, aber nicht erneut übernommen (Marker im Workspace).
- **Aussehen je Build:** Bei einem Build mit nur einem Bereich tragen Name, Symbol und Manifest den Namen dieses Bereichs; sind beide enthalten, heißt die App wie die Suite (Name legt der Nutzer später fest, bis dahin „Klexel").

## Überlassen dem Builder

Genaue Oberfläche der Projektliste und des Bereichswechsels (mobil), Format der Vorschau, Speicherschema in IndexedDB und Migration, Mechanik der Build-Einstellung, Verhalten bei zu großen Animationen, Umgang mit Service Worker und Cache-Version, Teststrategie über beide Pakete.
