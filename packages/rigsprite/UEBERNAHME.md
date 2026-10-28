# Übernahme von Rigsprite

Dieses Paket ist eine Kopie des eigenständigen Rigsprite.

- Quelle: `D:\source\repos\rigsprite` (GitHub: https://github.com/MarikRogers/rigsprite)
- Commit: `0b33046` (`0b3304698f0e9d31984bbc58a9edfcfa1126552c`, „feat: user's pixel logo; show/hide the rig overlay")
- Datum der Übernahme: 2026-10-28
- Übernommen per `git archive HEAD`: `src/`, `e2e/`, `public/`, `index.html`, `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`. Nicht übernommen: `node_modules/`, `test-results/`, `.git/`, `package-lock.json` (die Suite hat eine gemeinsame Sperrdatei an der Wurzel), `docs/` (Pläne und Spezifikation bleiben im Original).
- Einzige Änderung beim Übernehmen: Paketname `rigsprite` → `@suite/rigsprite` in `package.json`. Die gepinnten Versionen der Abhängigkeiten sind unverändert.

Das Original-Repository bleibt unverändert bestehen. Spätere Änderungen am Original werden von Hand in die Suite übertragen (Diff ab dem oben genannten Commit).
