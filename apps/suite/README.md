# @suite/app – Hülle der Suite

## Bereiche beim Bauen wählen (`VITE_AREAS`)

Welche Bereiche im Build stecken, legt die Umgebungsvariable `VITE_AREAS` fest (kommagetrennt, Groß-/Kleinschreibung
und Leerzeichen egal): `klexel`, `rigsprite` oder beide. Ohne `VITE_AREAS` werden alle Bereiche gebaut; ein leerer Wert
oder ein unbekannter Name bricht den Build mit einer Meldung ab. Ein abgeschalteter Bereich fehlt komplett im Bundle
(und damit im Service-Worker-Cache); Projekte seiner Art bleiben im Workspace erhalten und sind als „nicht verfügbar"
gekennzeichnet.

```sh
npm run build                                   # alle Bereiche
VITE_AREAS=klexel npm run build                 # nur Klexel (PowerShell: $env:VITE_AREAS='klexel'; npm run build)
node apps/suite/scripts/verify-bundle.mjs klexel # prüft dist/ anhand der AREA_MARKER-Konstanten der Bereiche
npm run deploy -- --areas klexel                # bauen, prüfen, auf gh-pages veröffentlichen
npm run deploy -- --areas klexel --dry-run      # nur bauen und prüfen, nichts veröffentlichen
```

`npm run deploy` setzt die Auswahl immer ausdrücklich (`--areas`, sonst `VITE_AREAS` aus der Umgebung, sonst alle);
ein `VITE_AREAS` aus `.env`-Dateien gilt dort nicht. Ein von npm geschlucktes `--dry-run` wird ebenfalls als Probelauf behandelt.

Name, Titel und Manifest richten sich nach der Auswahl (nur Rigsprite → „RigSprite", sonst „Klexel"); der Cache-Name des
Service Workers ist je Auswahl verschieden (Standard-Build: `pixelart-v7`, sonst `pixelart-<bereiche>-v7`, z. B. `pixelart-klexel-v7`, `pixelart-rigsprite-v7`); der Service Worker liest nur aus dem
eigenen Cache und löscht beim Aktivieren alle anderen `pixelart-*`-Caches (fremde Caches bleiben).

**Stand:** Klexel und Rigsprite sind beide als Bereiche eingebunden; der Standard-Build enthält beide, ein Build nur mit `klexel` oder nur mit `rigsprite` funktioniert ebenso. Alte Rigsprite-Daten kommen einmalig über „Speichern" (`*.rigsprite.json`) im alten Rigsprite und „Datei laden…" in der Suite hinein.
