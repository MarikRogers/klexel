# Über-Bereich der Suite

Stand: 2026-10-28 · Status: Idee, bewusst auf später verschoben · Teil von `2026-10-18-roadmap.md`

## Anlass

Klexel hat heute einen „Über"-Dialog, den man über das Logo oben links öffnet (Version, Impressum, Datenschutz). In der Suite verschwindet auf schmalen Handys im Hochformat (< 420 px) der Schriftzug „Klexel" neben dem Logo; das Logo bleibt der Zugang zum Dialog. Der Nutzer findet das Ausblenden in Ordnung, solange die Bedienung nicht leidet, und möchte später einen eigenen Über-Bereich für Informationen u. Ä. einrichten.

## Offen (beim Aufgreifen klären)

- Was soll dort stehen (Version, Impressum/Datenschutz, Hinweise zu Workspace und lokaler Speicherung, Hilfe zum Austausch Klexel ↔ Rigsprite, Änderungsprotokoll …)?
- Wie erreicht man ihn (Logo, Eintrag in der Projektliste, eigener Knopf)? Er muss in beiden Bereichen und bei einem Build mit nur einem Bereich erreichbar sein.
- Gehört er zur Hülle (bereichsübergreifend) oder pro Bereich?

## Hinweise

- Bestehender Dialog: `packages/klexel/src/ui/aboutDialog.ts` und `aboutLinks.ts`; statische Seiten `impressum.html`, `datenschutz.html` in `apps/suite/public/`.
- Leitplanken wie bei der Suite: kein Konto, kein Backend, mobile first, Touch-Ziele ≥ 44 px.
