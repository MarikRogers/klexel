# Bild im Link teilen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Sprite lässt sich als Link (Bild im `#`-Teil der Adresse) verschicken; beim Öffnen zeigt Klexel eine Vorschau mit „PNG speichern" und „In Klexel bearbeiten".

**Architecture:** Ein reiner, synchroner Codec (`linkCodec.ts`) baut aus Pixeln einen Byte-Block (Palette + gepackte Indizes) und liest ihn strikt zurück. Eine dünne asynchrone Schicht (`link.ts`) kümmert sich um Kompression (`CompressionStream`), Base64url, URL-Aufbau und Längenstufen. Zwei Dialoge (Absender, Empfänger) und die Verdrahtung in `main.ts` bilden die Oberfläche.

**Tech Stack:** TypeScript, Vite, Vitest (Node 18+, dort gibt es `CompressionStream`), keine neuen Abhängigkeiten.

**Spec:** `../specs/2026-10-18-bild-im-link-design.md`

## Global Constraints

- Link: `<Basis>#i=<Wert>`, `<Basis>` = `new URL('./', location.href)` ohne `#` und Suchteil; `<Wert>` = Base64url (`A–Z a–z 0–9 - _`, ohne `=`).
- Bytes: Byte 0 Version `1`; Byte 1 Flags (Bit 0 Transparenz vorhanden, Bit 1 deflate-raw-komprimiert, alle anderen Bits `0`); danach (nach evtl. Dekompression) `w` (1–64), `h` (1–64), `n` (0–32), `n`×RGB, Pixel dicht gepackt (MSB zuerst, zeilenweise).
- Bits je Pixel `ceil(log2(n + t))` mit `t = 1` bei Transparenz, sonst `0`; bei `n + t ≤ 1` kein Pixelteil. Mit Transparenz: Index 0 = transparent, Index `k ≥ 1` = Palettenfarbe `k − 1`; ohne: Index `k` = Palettenfarbe `k`.
- Alpha < 128 = transparent, sonst deckend (Alpha 255). Palette = verschiedene RGB-Werte deckender Pixel in Reihenfolge des ersten Auftretens (zeilenweise). Gleiche Eingabe → gleicher Link.
- Grenzen: Bild 1–64 je Seite, höchstens 32 Farben, nicht ganz leer (mindestens ein deckendes Pixel). Linklänge (volle URL): ≤ 2000 `ok`, 2001–4000 `warn`, > 4000 kein Link (`too-long`).
- Kompression nur setzen, wenn sie den Wert (Base64url-Länge) **strikt** kürzer macht und `CompressionStream` vorhanden ist.
- Empfänger prüft strikt (gültige Zeichen, Version, Maße, `n ≤ 32`, exakte Pixellänge, Indizes in Reichweite, keine unbekannten Flag-Bits); alles andere ist „beschädigt".
- Dokument bleibt unverändert bis „In Klexel bearbeiten"; Ersetzen nur nach Rückfrage, wenn das Bild nicht leer ist (`docHasContent`, `src/photo/hasContent.ts`).
- Texte auf Deutsch: „Der Link ist beschädigt oder unvollständig.", „Dieser Link stammt von einer neueren Version von Klexel. Bitte Klexel aktualisieren.", „Dein Browser kann diesen Link nicht lesen.", „Das aktuelle Bild wird ersetzt. Fortfahren?". Tests: `npm test` im Ordner `D:\source\docs\pixelart`.

## Review Focus

- Bild mit nur einer Farbe ohne Transparenz: 0 Bit je Pixel, kein Pixelteil, Rundlauf stimmt.
- Bild mit genau 32 Farben plus Transparenz (33 Indizes, 6 Bit) und 64×64: Rundlauf, Länge im erwarteten Rahmen.
- Komplett transparentes Bild: Problem `empty`, kein Link.
- Abgeschnittener Link (Wert hinten gekürzt), Wert mit unzulässigen Zeichen, Wert mit Rest-Parametern (`#i=...&x=1`): verständliche Meldung statt Fehler; fremder `#`-Teil (`#foo`) wird ignoriert, ohne Meldung.
- Link zweimal öffnen / Seite nach Schließen neu laden: Dialog erscheint nicht erneut.
- Kein `navigator.share` oder Zwischenablage verweigert: Dialog bleibt bedienbar mit verständlichem Hinweis.

---

### Task 1: Codec (Palette, Bit-Packen, strikte Prüfung)

**Files:**
- Create: `src/share/linkCodec.ts`
- Test: `src/share/linkCodec.test.ts`

**Interfaces:**
- Produces (alles in `linkCodec.ts`):
  ```ts
  export const MAX_SIDE = 64;
  export const MAX_COLORS = 32;
  export interface DecodedImage { width: number; height: number; pixels: Uint32Array } // 0xRRGGBBAA, transparent = 0
  export type EncodeProblem = { kind: 'empty' | 'too-large' | 'too-many-colors'; colors?: number }
  export function encodeImage(width: number, height: number, pixels: Uint32Array):
    { ok: true; transparent: boolean; body: Uint8Array } | { ok: false; problem: EncodeProblem }
  export type DecodeError = 'corrupt'
  export function decodeBody(body: Uint8Array, transparent: boolean): { ok: true; image: DecodedImage; colors: number } | { ok: false; error: DecodeError }
  export function toBase64Url(bytes: Uint8Array): string
  export function fromBase64Url(text: string): Uint8Array | null   // null bei unzulässigen Zeichen oder Länge mod 4 == 1
  ```
  `body` beginnt bei `w` (ohne Version/Flags). `colors` = `n`. `decodeBody` liefert Pixel mit Alpha 255 bzw. `0`.

- [ ] **Step 1: Failing tests** in `linkCodec.test.ts`:
  - `toBase64Url`/`fromBase64Url`: Rundlauf für Längen 0, 1, 2, 3, 4, 100 mit allen Byte-Werten; Ausgabe enthält nie `+`, `/`, `=`; `fromBase64Url('a$b')` → `null`; `fromBase64Url('A')` (Länge mod 4 = 1) → `null`.
  - `encodeImage`, 2×1 mit `[0xff0000ff, 0x00ff00ff]`: `body` = `[2, 1, 2, 255,0,0, 0,255,0, 0b01000000]` (n=2, ohne Transparenz 1 Bit je Pixel: Indizes 0,1 → `01` am Anfang, Rest 0), `transparent === false`.
  - Mit Transparenz: `[0, 0xff0000ff]` (erstes Pixel transparent) → `transparent === true`, `n = 1`, Bits je Pixel 1 (n+t = 2): Indizes `0,1` → Pixelbyte `0b01000000`.
  - Eine Farbe ohne Transparenz (`[0x336699ff, 0x336699ff]`): `body` = `[2, 1, 1, 0x33,0x66,0x99]`, kein Pixelteil.
  - Alpha: `0x11223340` (64) → transparent; `0x11223380` (128) → deckend mit RGB `11 22 33`.
  - Palettenreihenfolge = erstes Auftreten (zeilenweise), Duplikate nur einmal; `n = 32` ist erlaubt, `n = 33` → `{ ok: false, problem: { kind: 'too-many-colors', colors: 33 } }`.
  - Breite 65 oder Höhe 65 → `too-large`; komplett transparent (oder alle Alpha < 128) → `empty`.
  - Bitbreiten: Bilder mit `n + t` = 2, 3, 5, 17, 33 Indizes prüfen über Rundlauf (`decodeBody(encode(...).body, encode(...).transparent)` ergibt dieselben Pixel; Pixel mit Alpha ≥ 128 kommen als Alpha 255 zurück).
  - `encodeImage` ist deterministisch (zweimal aufrufen → gleiche Bytes).
  - `decodeBody` Fehler (`{ ok: false, error: 'corrupt' }`): leer; `w = 0`; `w = 65`; `h = 0`; `n = 33`; Pixelteil um 1 Byte zu kurz; Pixelteil um 1 Byte zu lang; Index außerhalb (z. B. n = 3 ohne Transparenz, 2 Bit je Pixel, Index 3); Palette abgeschnitten.
- [ ] **Step 2: Run** `npm test -- share/linkCodec` → FAIL (Modul fehlt).
- [ ] **Step 3: Implement.** Bits je Pixel `bits(count) = count <= 1 ? 0 : ceil(log2(count))` (ganzzahlig, ohne Fließkommafehler). Pixelteil: `ceil(w*h*bits / 8)` Bytes, Restbits des letzten Bytes `0`; der Empfänger fordert genau diese Länge und prüft, dass die Restbits `0` sind (sonst „corrupt").
- [ ] **Step 4: Run** `npm test -- share/linkCodec` → PASS.
- [ ] **Step 5: Commit** (`feat: Link-Codec (Palette, Bit-Packen, strikte Prüfung)`).

---

### Task 2: Link bauen und lesen (Kompression, Längenstufen)

**Files:**
- Create: `src/share/link.ts`
- Test: `src/share/link.test.ts`

**Interfaces:**
- Consumes: `encodeImage`, `decodeBody`, `toBase64Url`, `fromBase64Url`, `DecodedImage`, `MAX_SIDE`, `MAX_COLORS` (Task 1).
- Produces (in `link.ts`):
  ```ts
  export const LINK_OK_MAX = 2000;
  export const LINK_WARN_MAX = 4000;
  export type ShareResult =
    | { ok: true; url: string; length: number; level: 'ok' | 'warn' }
    | { ok: false; reason: 'empty' | 'too-large' | 'too-many-colors' | 'too-long'; colors?: number; length?: number };
  export function createShareLink(img: DecodedImage, base: string): Promise<ShareResult>
  export type OpenError = 'corrupt' | 'newer' | 'no-decompress';
  export type OpenResult = { ok: true; image: DecodedImage; colors: number } | { ok: false; error: OpenError };
  export function readShareLink(hash: string): Promise<OpenResult | null>
  ```
  `base` ist eine Adresse ohne `#` (z. B. `https://marikrogers.github.io/klexel/`). `length` ist die Länge der vollen URL. `readShareLink` bekommt `location.hash` (mit oder ohne führendes `#`) und liefert `null`, wenn kein `i=`-Parameter vorhanden ist.

- [ ] **Step 1: Failing tests** in `link.test.ts`:
  - Rundlauf: 16×16-Bild (zwei Farben + Transparenz) → `createShareLink` → `url` beginnt mit `base + '#i='` → `readShareLink(new URL(url).hash)` ergibt dasselbe Bild (`ok: true`, gleiche Pixel, gleiche Maße, `colors === 2`).
  - Determinismus: zweimal dasselbe Bild → identische URL.
  - Kompression nur wenn kürzer: ein 64×64-Bild mit großen einfarbigen Flächen (komprimiert deutlich kürzer) → Flag-Bit 1 gesetzt (`fromBase64Url(wert)[1] & 2 === 2`); ein winziges Bild (2×1) → Bit nicht gesetzt.
  - Längenstufen mit synthetischen Bildern: ein Bild, dessen Link ≤ 2000 ist → `level: 'ok'`; ein 64×64-Bild mit 32 Farben und pseudozufälligen Indizes (feste Startzahl, damit deterministisch; ergibt > 2000 und ≤ 4000 oder > 4000 — der Test wählt die Parameter so, dass `warn` erreicht wird, und prüft `level === 'warn'` bzw. bei `> 4000` `reason: 'too-long'` mit `length > 4000`); beide Fälle abdecken (zwei Bilder).
  - Probleme: leeres Bild → `{ ok: false, reason: 'empty' }`; 65×64 → `too-large`; 33 Farben → `too-many-colors` mit `colors: 33`.
  - `readShareLink`: `''` und `'#foo'` und `'#x=1'` → `null`; `'#i=%%%'` → `{ ok: false, error: 'corrupt' }`; `'#i='` (leer) → `corrupt`; abgeschnittener gültiger Wert (letztes Zeichen entfernt, sodass die Länge nicht mehr passt) → `corrupt`; Version 2 (erstes Byte `2`, sonst gültig) → `{ ok: false, error: 'newer' }`; unbekanntes Flag-Bit (z. B. `0x04`) → `corrupt`; Rest-Parameter `'#i=<wert>&x=1'` wird ignoriert und liefert das Bild.
  - `no-decompress`: Wenn `DecompressionStream` nicht vorhanden ist (im Test `vi.stubGlobal('DecompressionStream', undefined)`) und das Flag-Bit 1 gesetzt ist → `{ ok: false, error: 'no-decompress' }`; ohne gesetztes Bit funktioniert das Lesen trotzdem.
- [ ] **Step 2: Run** `npm test -- share/link.test` → FAIL.
- [ ] **Step 3: Implement.** Kompression über `new Blob([body]).stream().pipeThrough(new CompressionStream('deflate-raw'))` (bzw. `DecompressionStream`) und `new Response(stream).arrayBuffer()`; Fehler beim Dekomprimieren → `corrupt`. Zusammensetzen: `[1, flags, ...body]` bzw. `[1, flags | 2, ...compressed]`, Base64url, URL `base + '#i=' + wert`. Beim Lesen: `URLSearchParams(hash ohne '#').get('i')`; `null` → `null`; Byte 0 > 1 → `newer`; Byte 0 ≠ 1 sonst → `corrupt`. Längenstufen aus `LINK_OK_MAX`/`LINK_WARN_MAX`.
- [ ] **Step 4: Run** `npm test -- share/link.test` und `npm test` → PASS.
- [ ] **Step 5: Commit** (`feat: Link bauen und lesen (Kompression, Längenstufen)`).

---

### Task 3: Absender-Dialog „Link teilen"

**Files:**
- Create: `src/ui/shareDialog.ts`
- Modify: `src/main.ts` (Button `#share` in `.row-file`, Dialog erzeugen), `src/style.css`

**Interfaces:**
- Consumes: `createShareLink`, `ShareResult`, `DecodedImage`, `LINK_OK_MAX` (Task 2); `showToast` (`src/ui/toast.ts`); `PixelDocument.compositeFrame`, `doc.currentFrameId`, `doc.width`, `doc.height`.
- Produces: `createShareDialog(deps: { getImage(): DecodedImage }): { open(): Promise<void> }`.

- [ ] **Step 1: Implement** den Dialog nach dem Muster von `consoleExportDialog.ts` (`<dialog id="shareDlg">`, Klick auf den Hintergrund schließt, Schaltflächen mindestens 44 px):
  - `open()` holt `deps.getImage()`, berechnet `createShareLink(image, base)` mit `base = new URL('./', location.href)` ohne `#`/Suchteil (`url.hash = ''; url.search = ''`), zeigt Vorschau (`<canvas>`, pixelscharf, sichtbare Transparenz), Linklänge und Status.
  - Status: `level 'ok'` → „Link bereit"; `'warn'` → „Der Link ist lang und kommt in manchen Messengern möglicherweise nicht vollständig an."; kein Link → Grund („Der Link wäre zu lang.", „Das Bild hat mehr als 32 Farben (N).", „Das Bild ist größer als 64×64.", „Das Bild ist leer.") plus Hinweis „Speichere das Bild stattdessen als PNG (Button ⤓)."
  - Schaltflächen bei Link: „Link teilen" (nur wenn `navigator.share` existiert; `navigator.share({ url })`, Abbruch durch den Nutzer wird still ignoriert), „Link kopieren" (`navigator.clipboard.writeText`; bei Erfolg `showToast('Link kopiert')`, sonst Hinweis im Dialog „Kopieren nicht möglich. Markiere den Link unten und kopiere ihn von Hand." und ein schreibgeschütztes Textfeld mit dem Link zum Markieren), „Schließen".
- [ ] **Step 2: Einstieg.** In `main.ts` Button `<button id="share" title="Link teilen">🔗</button>` in `.row-file` hinter `#photo`; Klick: `settleSelection()`, dann `shareDlg.open()`. `getImage: () => ({ width: doc.width, height: doc.height, pixels: doc.compositeFrame(doc.currentFrameId).slice() })`. CSS in `style.css` im Muster von `#consoleDlg`/`.cx-*` (`#shareDlg`, `.sh-*`).
- [ ] **Step 3: Prüfen.** `npm run build` fehlerfrei, `npm test` PASS. Im Browser: Button öffnet den Dialog; ein leeres Bild zeigt „Das Bild ist leer."; ein gezeichnetes Bild zeigt Länge und „Link bereit"; „Link kopieren" liefert die Meldung „Link kopiert" oder den Fallback.
- [ ] **Step 4: Commit** (`feat: Dialog „Link teilen"`).

---

### Task 4: Empfänger-Dialog und Start-Auswertung

**Files:**
- Create: `src/ui/linkOpenDialog.ts`
- Modify: `src/main.ts` (Start: `location.hash` auswerten), `src/style.css`

**Interfaces:**
- Consumes: `readShareLink`, `OpenResult`, `OpenError` (Task 2); `DecodedImage`; `PixelDocument` (`new PixelDocument(w, h)`, `doc.data`); `exportPng(doc, scale)` aus `src/storage/storage.ts`; `saveBlob` (`src/export/saveBlob.ts`); `docHasContent` (`src/photo/hasContent.ts`); `showToast`.
- Produces: `createLinkOpenDialog(deps: { getDoc(): PixelDocument; onApply(doc: PixelDocument): void; onClose(): void }): { open(image: DecodedImage, colors: number): void }`.

- [ ] **Step 1: Implement** `createLinkOpenDialog` (`<dialog id="linkDlg">`, Touch-Größen ≥ 44 px, Klick auf den Hintergrund schließt):
  - Zeigt Vorschau (pixelscharf, Transparenz sichtbar), „W×H Pixel, N Farben".
  - **PNG speichern:** `PixelDocument` aus dem Bild bauen, `exportPng(doc, max(1, floor(512 / max(w, h))))`, `saveBlob(blob, 'klexel.png', 'image/png')`.
  - **In Klexel bearbeiten:** bei `docHasContent(deps.getDoc())` zuerst `confirm('Das aktuelle Bild wird ersetzt. Fortfahren?')` (bei Abbruch bleibt der Dialog offen); dann neues `PixelDocument(w, h)` mit den Pixeln in `doc.data`, `dlg.close()`, `deps.onApply(d)`.
  - **Schließen:** `dlg.close()`. Bei **jedem** Schließen (Schaltfläche, Hintergrund, Escape, nach Übernehmen) wird `deps.onClose()` aufgerufen (über das `close`-Ereignis des Dialogs).
- [ ] **Step 2: Start-Auswertung** in `main.ts`: Nach dem Laden des gespeicherten Standes (`loadState().then(...)`) und unabhängig vom Ausgang (auch ohne gespeicherten Stand) `await readShareLink(location.hash)`:
  - `null` → nichts tun.
  - `{ ok: false }` → `showToast` mit dem Text zum Fehler (`corrupt`: „Der Link ist beschädigt oder unvollständig."; `newer`: „Dieser Link stammt von einer neueren Version von Klexel. Bitte Klexel aktualisieren."; `no-decompress`: „Dein Browser kann diesen Link nicht lesen."), Toast-Dauer 4000 ms; danach `#` aus der Adresszeile entfernen.
  - `{ ok: true }` → `linkDlg.open(image, colors)`.
  - `onClose`: `history.replaceState(null, '', location.pathname + location.search)`. `onApply: d => { attach(d); scheduleSave(); }`.
  - Zusätzlich `hashchange` auswerten (Link wird in der schon offenen Seite eingefügt): gleicher Ablauf, aber nur, wenn gerade kein anderer Link-Dialog offen ist.
- [ ] **Step 3: Prüfen.** `npm run build` fehlerfrei, `npm test` PASS. Im Browser: Link aus dem Absender-Dialog in einem neuen Tab öffnen → Vorschau erscheint, Adresszeile wird nach dem Schließen bereinigt, Neuladen öffnet den Dialog nicht erneut; „PNG speichern" löst den Download bzw. das Teilen-Menü aus; „In Klexel bearbeiten" ersetzt das Bild (mit Rückfrage bei nicht leerem Bild); `#i=kaputt` zeigt die Fehlermeldung, `#foo` nichts.
- [ ] **Step 4: Commit** (`feat: Link öffnen – Vorschau, PNG speichern, in Klexel bearbeiten`).

---

## Self-Review (Kurzfassung)

- **Spec-Abdeckung:** Absender-Dialog mit Länge, Stufen und Gründen (T2, T3), Format, Palette, Transparenz, Determinismus (T1), Kompression nur bei Gewinn (T2), strikte Prüfung und Fehlermeldungen (T1, T2, T4), Empfänger-Dialog mit zwei Schaltflächen und Rückfrage (T4), `#`-Bereinigung und Neuladen (T4), kein Server, keine neuen Abhängigkeiten. Nicht abgedeckt wie in der Spec ausgeschlossen: Frames/Ebenen, QR, Link-Kürzer, Auto-Reduzierung.
- **Typkonsistenz:** `DecodedImage` (T1) wird in T2–T4 mit denselben Feldern genutzt; `ShareResult`/`OpenResult` (T2) in T3/T4.
- **Entscheidungen des Planers:** Parameter heißt `i`; Restbits des letzten Pixelbytes müssen `0` sein; Hintergrund-`hashchange` zusätzlich zum Start; Texte der Gründe und des Kopier-Fallbacks; Toast 4000 ms; Symbol 🔗.
