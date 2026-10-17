# Zeichen-Replay als Zeitraffer (Idee 4)

Stand: 2026-10-18 · Status: Idee · Priorität: nach der Werkbank · Teil von `2026-10-18-roadmap.md`

- Die History speichert schon jeden Schritt als Pixel-Diff. Dauerhaft mitgeschrieben ließe sich das Entstehen des Bildes als Zeitraffer abspielen.
- Export als GIF oder Video (GIF-Export ist auch eine Grundlage, siehe `2026-10-18-grundlagen.md`).
- Nutzen: beliebter Teil-Anreiz in sozialen Netzwerken, Verbreitungs-Hebel.
- Aufwand: mittel.
- Voraussetzung: Die History muss persistiert werden; das Limit von 100 Schritten fällt weg.

## Offene Fragen

- Speicherbedarf: Diffs komprimieren? Obergrenze pro Dokument? Alte Schritte zusammenfassen?
- Undo-Semantik: Gehören rückgängig gemachte Schritte zum Replay?
- Abspielgeschwindigkeit: feste Gesamtdauer (z. B. 5 s) statt Echtzeit.
- Wechselwirkung mit Frames/Ebenen und einem späteren Projekt-Browser.
