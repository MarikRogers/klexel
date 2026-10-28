# Rigsprite: Bewegung in der Tiefe – Umsetzungsplan

> **Für Agenten:** Benötigter Skill: superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans. Schritte nutzen Checkboxen (`- [ ]`).

**Ziel:** Bones lassen sich in der Tiefe bewegen (Kippen, Drehen, Tiefe); Sprites bleiben flach in der Bone-Ebene und verzerren sich orthografisch. Sperrbar fürs ganze Projekt.

**Architektur:** Neben der bisherigen 2D-Kette (`Mat2D`) kommt eine 3D-Kette (`Mat3D`, affin, 12 Zahlen). `buildFrame` nimmt den **bisherigen 2D-Pfad unverändert**, solange keine Pose Kippen/Drehen/Tiefe ≠ 0 enthält (oder das Projekt gesperrt ist); nur sonst rechnet der 3D-Pfad. Er liefert wie bisher 2D-Positionen (x, y der 3D-Position) plus eine mittlere Tiefe je Teil für die Zeichenreihenfolge. Der WebGL-Renderer bleibt unverändert; die Orbit-Kamera bekommt die Teil-Tiefe zur Ebenen-Tiefe addiert.

**Tech-Stack:** TypeScript, React/zustand (`packages/rigsprite`), Vitest. Befehle im Repo-Root `D:\source\repos\klexel`: `npm test -w packages/rigsprite`, `npm run typecheck -w packages/rigsprite`; zum Schluss alle Pakete und die drei Builds (siehe Task 7).

**Spec:** `docs/specs/2026-10-28-rigsprite-z-achse-design.md`

## Globale Vorgaben

- Anti-Ziel: Ohne Tiefenwerte oder bei gesperrtem Projekt sind Positionen, Reihenfolge, Export **bitgleich** zu heute. Kein bestehender Test wird abgeschwächt; nur Tests, die ein festes Settings-Objekt oder `version` vergleichen, dürfen um das neue Feld ergänzt werden.
- Namen: Kanäle `tilt`, `turn`, `depth`; Einstellung `settings.depthLocked: boolean` (Standard `false`). Deutsche UI-Texte: „Kippen“, „Drehen“, „Tiefe“, „Tiefe sperren“.
- Achsen sind **bone-lokal** (Ruling, weicht vom Wortlaut der Spec ab, Spec wird in Task 1 angepasst): `tilt` = Drehung um die lokale y-Achse (Spitze des Bones zur Kamera hin/weg; positiv = Spitze nach vorn, +Tiefe), `turn` = Drehung um die lokale x-Achse (Bone-Achse; positiv = lokale +y-Seite nach vorn). Für einen nach unten zeigenden Bein-Bone ist das Kippen vor/zurück und das Drehen um die Hochachse. `depth` = Verschiebung entlang z im Eltern-Raum, +z = zur Kamera hin (wie `view.ts`).
- Reihenfolge der lokalen Matrix: `T(x, y, depth) · Rz(rotation) · Ry(tilt) · Rx(turn) · S(scaleX, scaleY, 1)`.
- Winkelgrenze: `tilt` und `turn` werden in der Kette auf ±`MAX_DEPTH_ANGLE_DEG` = 85 begrenzt (`defaults.ts`), damit die projizierte Matrix nie singulär wird.
- Projekt-Version: `Project.version` bleibt im Speicher `1`. `serializeProject` schreibt `2`, wenn irgendeine Animation einen Tiefenkanal-Schlüssel enthält, sonst `1` (byte-gleich zu heute). `parseProjectData` akzeptiert `1` und `2`. Ältere App-Stände lehnen `2` mit „nicht unterstützte Version“ ab; das ist der gewollte Hinweis (Ruling).
- Tiefen-Sortierung: Teile-Tiefe auf ganze Rig-Pixel gerundet (`DEPTH_SORT_STEP` = 1), danach Ebene `z`, danach Index.
- Touch-Ziele ≥ 44 px; kein neuer Laufzeit-Abhängigkeits-Zuwachs.

## Review-Fokus

1. Alle bestehenden Vorlagen ohne Tiefenwerte: Positionen und Reihenfolge bitgleich zum alten Pfad (Task 3, 4).
2. Gesperrtes Projekt mit vorhandenen Tiefen-Schlüsseln: wie ohne Schlüssel; Entsperren stellt sie wieder her (Task 3).
3. Kippen/Drehen nahe ±85° oder eine Eltern-Kind-Kette, die sich zu 90° summiert, darf nichts werfen (singuläres `invert`), weder beim Ziehen noch beim Zeichnen (Task 1, 6).
4. Projekt mit Tiefenkanälen speichern → neuere Datei; Datei ohne Tiefe bleibt `version: 1` (Task 2).
5. Sprite-Reihenfolge wechselt, wenn ein Bein die Tiefe des Körpers kreuzt, in Vorder- und Rückansicht und unter Orbit-Kamera (Task 4).

---

### Task 1: 3D-Mathematik und Kette

**Dateien:**
- Erstellen: `packages/rigsprite/src/core/math3d.ts`, `packages/rigsprite/src/core/math3d.test.ts`
- Ändern: `packages/rigsprite/src/core/defaults.ts` (Konstanten), `packages/rigsprite/src/core/rig.ts` (Kette), `packages/rigsprite/src/core/rig.test.ts`, `docs/specs/2026-10-28-rigsprite-z-achse-design.md` (Achsen bone-lokal, siehe Vorgaben)

**Schnittstellen:**
- Erzeugt: `type Mat3D = [xx, xy, xz, yx, yy, yz, zx, zy, zz, tx, ty, tz]` (Spalten = Bilder der x-, y-, z-Achse, dann Verschiebung; wie die Konvention von `Mat2D`: `p' = xAxis·p.x + yAxis·p.y + zAxis·p.z + t`).
- Erzeugt in `math3d.ts`: `identity3(): Mat3D`, `multiply3(m, n): Mat3D` (wendet `n` zuerst an, dann `m`), `fromBone3D(o: {x,y,z,rotation,tilt,turn,scaleX,scaleY}): Mat3D` (Reihenfolge laut Vorgaben, Winkel in Grad, `tilt`/`turn` auf ±`MAX_DEPTH_ANGLE_DEG` begrenzt, `cosSinDeg` aus `math.ts` für exakte 0/±1), `embed2D(m: Mat2D): Mat3D` (z-Achse bleibt, `tz = 0`), `projectTo2D(m: Mat3D): Mat2D` (`[xx, xy, yx, yy, tx, ty]`), `applyToPoint3(m, p: {x,y,z}): {x,y,z}`.
- Erzeugt in `rig.ts`: `computeWorldTransforms3D(rig: Rig, pose: Pose): Record<string, Mat3D>` (wie `computeWorldTransforms`, Bone-Wert + Pose-Offset; `depth` addiert sich auf `0` als Rest-z) und `poseUsesDepth(pose: Pose): boolean` (true, wenn ein Offset `tilt`, `turn` oder `depth` ≠ 0 hat).
- Erzeugt in `defaults.ts`: `MAX_DEPTH_ANGLE_DEG = 85`, `DEPTH_SORT_STEP = 1`.
- Verbraucht: `BoneOffset` mit den neuen Feldern aus Task 2 — in diesem Task zuerst `tilt`, `turn`, `depth` als **optionale** Felder zu `BoneOffset` hinzufügen (`tilt?: number` usw.; Task 2 macht sie zu echten Kanälen).

- [ ] **Schritt 1: Tests schreiben** (`math3d.test.ts`): `multiply3(identity3(), m)` gleich `m`; `fromBone3D` mit allen Winkeln 0 und Skalierung 1 ergibt für Position (3, 4, 0) und Rotation r exakt `embed2D(fromTRS(3, 4, r, 1, 1))` (bitgleich, `toEqual`); Tilt-Beispiel: Bone bei (0,0), `rotation: 90`, `tilt: 60`: die Spitze `(10, 0, 0)` landet bei `(0, 5, 8.66…)` (±1e-9); Turn-Beispiel: `rotation: 0`, `turn: 60`, Punkt `(0, 10, 0)` landet bei `(0, 5, 8.66…)`; `tilt: 200` wirkt wie 85 (kein NaN, `projectTo2D` hat Determinante ≠ 0); `projectTo2D(embed2D(m))` gleich `m`.
- [ ] **Schritt 2: Test ausführen**, erwartet: FAIL (Modul fehlt) — `npm test -w packages/rigsprite -- math3d`.
- [ ] **Schritt 3: `math3d.ts` implementieren** laut Signaturen oben.
- [ ] **Schritt 4: Kettentests** in `rig.test.ts`: ohne Pose entspricht `projectTo2D(computeWorldTransforms3D(rig)[id])` bitgleich `computeWorldTransforms(rig)[id]` für alle Bones von `humanoid` und `quadruped`; Kind folgt dem gekippten Elternteil (Oberschenkel `tilt: 60`, Schienbein ohne eigene Pose: dessen Ursprung hat z ≈ Länge·sin 60 des Oberschenkels); `poseUsesDepth({a: {rotation: 5}})` false, `({a: {tilt: 1}})` true, `({a: {depth: 0}})` false.
- [ ] **Schritt 5: `computeWorldTransforms3D` und `poseUsesDepth` implementieren** (Struktur wie `computeWorldTransforms`).
- [ ] **Schritt 6:** Spec-Abschnitt „Neue Bone-Werte“ auf bone-lokale Achsen angleichen (ein Satz: Kippen = Spitze zur Kamera hin/weg, Drehen = um die Bone-Achse). Alle Tests des Pakets laufen lassen, erwartet: PASS. Commit: `feat: 3D-Matrizen und Bone-Kette mit Kippen, Drehen und Tiefe`.

---

### Task 2: Kanäle, Projektformat und Sperr-Einstellung

**Dateien:**
- Ändern: `packages/rigsprite/src/core/animation.ts`, `core/rig.ts` (`BoneOffset`), `core/defaults.ts`, `core/project.ts` und die zugehörigen `*.test.ts`

**Schnittstellen:**
- Verbraucht: Konstanten aus Task 1.
- Erzeugt: `Channel` und `CHANNELS` um `'tilt' | 'turn' | 'depth'` erweitert (am Ende der Liste); `BoneOffset.tilt/turn/depth: number` (Pflichtfelder, Standardwert 0 über `channelDefault`); `ProjectSettings.depthLocked: boolean`, `DEFAULT_SETTINGS.depthLocked = false`; `usesDepthChannels(p: Project): boolean` (irgendein Schlüssel in einem der drei Kanäle in irgendeiner Animation) in `project.ts`.

- [ ] **Schritt 1: Tests schreiben:** `channelDefault('tilt')` ist 0; `setKey`/`sampleAnimation`/`removeBoneKeysAt`/`moveBoneKeys`/`keyedFrames` behandeln `tilt` wie `rotation` (je ein Fall); Roundtrip: Projekt mit `tilt`-Schlüsseln und `settings.depthLocked: true` → `serializeProject` → `parseProject` ergibt gleiche Tracks und Einstellung; `JSON.parse(serializeProject(p)).version` ist 2 mit Tiefenschlüssel, 1 ohne (auch bei `depthLocked: true` ohne Schlüssel); `parseProjectData` akzeptiert `version` 1 und 2, lehnt 3 ab; alte Datei ohne `depthLocked` lädt mit `false`; `depthLocked: "ja"` ergibt einen Fehler wie bei `mirror` („Ungültige Sperre der Tiefe in den Einstellungen.“).
- [ ] **Schritt 2: Tests ausführen**, erwartet FAIL.
- [ ] **Schritt 3: Implementieren:** Kanäle in `animation.ts`; `parseSettings` liest/validiert `depthLocked`; `serializeProject` schreibt `version` nach Regel (nur dieser Ausgabewert, im Speicher bleibt `1`); `parseProjectData` akzeptiert 1 und 2 und setzt im Ergebnis `version: 1`. Vorhandene Tests, die `settings` oder die Kanal-Liste exakt vergleichen, um die neuen Felder ergänzen (keine Abschwächung); prüfen, dass `descriptor.test.ts` mit `{ version: 2, rig: { bones: [] } }` weiterhin `null` liefert (Wurzel-Prüfung).
- [ ] **Schritt 4:** `npm test -w packages/rigsprite` und `npm run typecheck -w packages/rigsprite`, erwartet PASS. Commit: `feat: Kanäle Kippen, Drehen, Tiefe und Sperr-Einstellung im Projektformat`.

---

### Task 3: Frame-Berechnung mit 3D-Pfad und Sperre

**Dateien:**
- Ändern: `packages/rigsprite/src/core/skinning.ts`, `core/frame.ts`, `core/project.ts` (`toFrameInput`), `ui/viewportFrame.ts`; Tests: `core/skinning.test.ts`, `core/frame.test.ts`, `ui/viewportFrame.test.ts`

**Schnittstellen:**
- Verbraucht: `computeWorldTransforms3D`, `poseUsesDepth`, `embed2D`, `multiply3`, `projectTo2D` (Task 1); `settings.depthLocked` (Task 2).
- Erzeugt: `skinMatrices3D(restInverse: Record<string, Mat2D>, poseWorld: Record<string, Mat3D>): Record<string, Mat3D>` (= `pose · embed2D(restInverse)`); `skinVertices3D(mesh, weights, skin): { positions: Float32Array; depth: number }` (gleiches Gewichts-Mischen wie `skinVertices`, `depth` = Mittelwert der z-Werte aller Eckpunkte); `DrawItem.depth?: number` (fehlt = 0); `FrameInput.depthLocked?: boolean`; `toFrameInput` setzt `depthLocked` aus den Einstellungen; `FrameData.world` bleibt `Record<string, Mat2D>` (im 3D-Pfad `projectTo2D` der 3D-Welt).
- `buildFrame`: Ist `depthLocked`, werden `tilt`, `turn`, `depth` vor allem anderen aus der Pose entfernt. Danach: `poseUsesDepth(pose)` → 3D-Pfad, sonst der **unveränderte** bisherige Pfad. Die Sortierung nach `z` am Ende bleibt.
- `createFrameCache`: Schlüssel enthält `depthLocked` der Einstellungen.

- [ ] **Schritt 1: Tests schreiben:** (a) Referenz-Gleichheit: für jede Rig-Vorlage und jede Animationsvorlage ohne Tiefenkanäle liefert `buildFrame` für jedes Bild Positionen, die bitgleich dem direkt aus `computeWorldTransforms` + `skinMatrices` + `skinVertices` berechneten Ergebnis sind (Test baut die Referenz selbst, nicht über `buildFrame`); (b) Pose mit `tilt: 60` auf `thigh_L` eines Rigs mit einem Teil an diesem Bone: die y-Ausdehnung der Positionen schrumpft um ≈ cos 60 (±1e-6), `depth` des Items > 0; (c) dieselbe Pose mit `depthLocked: true` ist bitgleich zum Fall ohne Pose; (d) `skinVertices3D` ohne Tiefe liefert `positions` gleich `skinVertices` und `depth` 0; (e) Frame-Cache baut neu, wenn nur `depthLocked` wechselt.
- [ ] **Schritt 2: Tests ausführen**, erwartet FAIL.
- [ ] **Schritt 3: Implementieren** laut Schnittstellen; der 3D-Pfad nutzt `getRestPose` (2D) wie bisher.
- [ ] **Schritt 4:** Paket-Tests und Typecheck, erwartet PASS. Commit: `feat: Frame-Berechnung mit 3D-Pfad, Teil-Tiefe und Sperre`.

---

### Task 4: Zeichenreihenfolge nach Tiefe und Orbit-Kamera

**Dateien:**
- Ändern: `packages/rigsprite/src/render/layers.ts`, `render/layers.test.ts`, bei Bedarf `ui/hitTest.test.ts`

**Schnittstellen:**
- Verbraucht: `DrawItem.depth` (Task 3), `DEPTH_SORT_STEP`.
- Verhalten: `orderLayers(items, view, spacing)`: Sortierschlüssel Vorderansicht: `(round(depth / DEPTH_SORT_STEP) aufsteigend, Rang aufsteigend, Index)`; Rückansicht: `(Tiefe absteigend, Rang absteigend, Index)`. Der zurückgegebene `Layer.depth` ist `Ebenen-Tiefe (Rang · spacing) + item.depth`. Ohne Tiefenwerte entsteht exakt die bisherige Reihenfolge und Tiefe. `layerDepths` bleibt unverändert (reine Ebenen-Tiefe).
- `hitTestPart` nutzt bereits `Layer.depth`; keine Änderung nötig, nur Test.

- [ ] **Schritt 1: Tests schreiben:** bestehende `layers.test.ts` bleibt grün; neu: zwei Items mit Tiefe 0 und 5 und umgekehrter `z`-Reihenfolge — in der Vorderansicht ist das Item mit Tiefe 5 zuletzt; in der Rückansicht zuerst; Tiefe 0.4 und 0 sind gleich (Rundung), dann entscheidet `z`; `Layer.depth` ist Rang·spacing + Teil-Tiefe; `createLayerCache` liefert dasselbe Ergebnis für dieselben Items; Treffer-Test: das vordere Teil gewinnt.
- [ ] **Schritt 2: Tests ausführen**, erwartet FAIL.
- [ ] **Schritt 3: `orderLayers` anpassen** (Sortierung über Index-Array wie bisher, nur neuer Schlüssel).
- [ ] **Schritt 4:** Paket-Tests, erwartet PASS. Commit: `feat: Zeichenreihenfolge und Orbit-Tiefe berücksichtigen die Teil-Tiefe`.

---

### Task 5: Regler im Inspektor und Sperr-Schalter

**Dateien:**
- Erstellen: `packages/rigsprite/src/ui/DepthPanel.tsx`, `ui/DepthPanel.test.tsx`
- Ändern: `ui/Inspector.tsx` (Panel einbinden), `ui/CameraControls.tsx` (Sperr-Schalter neben „Spiegeln“), `ui/app.css` (Regler-Zeile), `ui/CameraControls`-Test falls vorhanden

**Schnittstellen:**
- Verbraucht: `poseBone(boneId, offset)`, `beginTransaction`/`commitTransaction`, `setSettings({ depthLocked })`, `sampleAnimation`, `selectActiveAnimation`.
- Erzeugt: `<DepthPanel />`: sichtbar, wenn Modus „animate“, eine Animation aktiv und ein Bone gewählt ist. Drei Zeilen „Kippen“, „Drehen“, „Tiefe“, je ein Bereichsregler (Kippen/Drehen −85…85 °, Tiefe −100…100 Rig-Pixel, 1er-Schritte) und ein Zahlenfeld (`CommitInput`-Muster wie `NumberField`), zeigen den abgetasteten Wert des Bones am aktuellen Frame, schreiben über `poseBone`. Ein Regler-Zug ist **ein** Undo-Schritt (Transaktion beim Drücken starten, beim Loslassen/Verlassen abschließen). Bei gesperrtem Projekt sind alle Eingaben `disabled`, und ein Hinweis „Tiefe ist gesperrt – Schalter ‚Tiefe sperren‘ lösen“ erscheint. Touch-Ziel der Regler ≥ 44 px Höhe.
- Sperr-Schalter in `CameraControls`: Button „Tiefe sperren“ mit `aria-pressed={depthLocked}`, ruft `setSettings({ depthLocked: !depthLocked })`; Titel erklärt, dass Werte erhalten bleiben.

- [ ] **Schritt 1: Tests schreiben** (`DepthPanel.test.tsx`, Muster von `Inspector.test.tsx`): Panel nicht sichtbar im Setup-Modus; im Animate-Modus zeigt es den abgetasteten Wert; Zahlenfeld-Eingabe 30 bei „Kippen“ setzt einen `tilt`-Schlüssel am aktuellen Frame; Regler-Zug erzeugt genau einen Undo-Eintrag (nach `undo` ist der Schlüssel weg); bei `depthLocked` sind Regler `disabled` und Hinweis sichtbar; der Sperr-Schalter schaltet `settings.depthLocked` um und ändert `aria-pressed`; Schalten erzeugt einen Undo-Schritt (wie `toggleMirror`) und lässt Schlüssel unberührt.
- [ ] **Schritt 2: Tests ausführen**, erwartet FAIL.
- [ ] **Schritt 3: Implementieren** laut Schnittstellen; Texte wie oben.
- [ ] **Schritt 4:** Paket-Tests und Typecheck, erwartet PASS. Sichtprüfung mit dem Dev-Server (Browser-Pane): Humanoid-Vorlage „Vorderansicht“, Oberschenkel wählen, „Kippen“ auf 50 ziehen: das Bein wird kürzer, Schalter „Tiefe sperren“ macht es wieder flach. Commit: `feat: Regler für Kippen, Drehen, Tiefe und Sperr-Schalter`.

---

### Task 6: Griff am Bone

**Dateien:**
- Erstellen: `packages/rigsprite/src/ui/tiltHandle.ts`, `ui/tiltHandle.test.ts`
- Ändern: `render/overlay.ts` (Griff zeichnen), `ui/viewportGestures.ts` (+ Test `viewportGestures.test.ts`), `ui/Viewport.tsx` (Griff-Position an das Overlay geben), `ui/constants.ts` (`TILT_HANDLE_OFFSET_PX`, `TILT_DEG_PER_PX`), `ui/posing.ts` (+ Test)

**Schnittstellen:**
- Verbraucht: `FrameData.world`, `worldToScreen`, `poseBone`, `BONE_HIT_PX`, `TOUCH_HIT_FACTOR`.
- Erzeugt: `tiltHandleScreenPos(view, world: Mat2D, bone: Bone): Vec2` — Mitte des Bones im Bildschirm, um `TILT_HANDLE_OFFSET_PX` (28) senkrecht zur Bone-Richtung versetzt; `hitTestTiltHandle(p: Vec2, handle: Vec2, pointerType: string): boolean` — Radius `BONE_HIT_PX` bzw. mit `TOUCH_HIT_FACTOR` (mindestens 22 px, also 44 px Durchmesser auf Touch); `tiltFromDrag(startTilt: number, dragPx: number): number` = auf ±85 begrenztes `startTilt + dragPx · TILT_DEG_PER_PX` (0.8), `dragPx` = Verschiebung in Richtung Bone-Spitze (zur Spitze hin = Spitze nach vorn); `drawOverlay(..., selectedBoneId, handle?: Vec2 | null)` zeichnet bei gesetztem `handle` einen kleinen Kreis mit Doppelpfeil.
- Gestenregel: In `startDrag` (Modus „animate“, Animation aktiv, Projekt nicht gesperrt) wird vor der Bone-/Teil-Suche geprüft, ob der Zeiger den Griff des gewählten Bones trifft; dann entsteht ein `tilt`-Drag (eigene Variante in `Gesture`, innerhalb einer Transaktion → ein Undo-Schritt), der `poseBone(boneId, { tilt })` setzt. Bei gesperrtem Projekt wird der Griff weder gezeichnet noch getroffen.
- `translationOffsetToward` und `rotationOffsetToward` dürfen bei singulärer Eltern-Matrix nicht werfen: `invert` in `try/catch`, dann wie ohne Elternteil rechnen.

- [ ] **Schritt 1: Tests schreiben:** `tiltFromDrag(0, 50)` = 40; Begrenzung bei ±85; `tiltHandleScreenPos` liegt senkrecht zur Bone-Richtung, 28 px von der Mitte; Treffertest: Maus knapp innerhalb/außerhalb, Touch mit größerem Radius; Gesten-Test: Ziehen am Griff erzeugt `tilt`-Schlüssel und nach Loslassen genau einen Undo-Eintrag; Abbruch (zweiter Finger) erzeugt keinen; bei `depthLocked` startet der Zug am Griff eine normale Auswahl und setzt keinen `tilt`; `translationOffsetToward` mit einem Elternteil, dessen projizierte Matrix Determinante 0 hat, wirft nicht und liefert `x + delta.x`, `y + delta.y`.
- [ ] **Schritt 2: Tests ausführen**, erwartet FAIL.
- [ ] **Schritt 3: Implementieren** laut Schnittstellen.
- [ ] **Schritt 4:** Paket-Tests und Typecheck, erwartet PASS. Sichtprüfung im Browser-Pane (Maus und, falls möglich, Touch-Emulation): Griff erscheint am gewählten Bone nur in Animate-Modus ohne Sperre; Ziehen kippt das Bein sichtbar. Commit: `feat: Griff zum Kippen eines Bones auf der Zeichenfläche`.

---

### Task 7: Vorlagen-Animationen für Vorder- und Rückansicht, Gesamtprüfung

**Dateien:**
- Ändern: `packages/rigsprite/src/core/templates/animations.ts`, `core/templates/animations.test.ts`

**Schnittstellen:**
- Verbraucht: Kanäle aus Task 2.
- Regeln (Ruling): In `frontalLocomotion` (walk, run) und in `jump` der Humanoid-Ansichten sowie in `leg` der Vierbeiner-Ansichten ersetzt je ein `tilt`-Track die bisherige gespielte Verkürzung per `scaleX` an Oberschenkeln, Oberarmen und Beinen (das Verkürzen entsteht jetzt aus der Projektion). Die `scaleX`-Verkürzung von `punch` (gleichmäßiger Maßstab als Perspektive) und alle Seitenansicht-Animationen bleiben unverändert. Vorzeichen: `tilt` positiv = Spitze zur Kamera hin; in der Vorderansicht schwingt das gehobene Bein nach vorn (`+`), in der Rückansicht von der Kamera weg (`−`), also Vorzeichen `side`. Für Schleifen gilt: Erster und letzter Wert jedes `tilt`-Tracks sind gleich (`cycle`-Hilfe wie bei den anderen Kanälen). Konkrete Winkel wählt der Umsetzer (Richtwert Gehen 12–18°, Rennen 25–35°, Sprung 20–35°); Sichtprüfung per Frame-Export.
- Der Hinweis „Perspektive“ in den Kommentaren wird passend zur neuen Lösung angepasst.

- [ ] **Schritt 1: Tests schreiben:** für alle `*-front`/`*-back`-Animationen `walk`, `run`, `jump` (Humanoid) und `walk` (Vierbeiner) enthält die Spur der Beine/Oberarme (`thigh_*`, `upperArm_*`, `frontUpper_*`, `backUpper_*`) einen `tilt`-Kanal; `tilt`-Werte der Rückansicht sind das negierte der Vorderansicht (gleiche Zeitpunkte); Schleifen schließen (erster = letzter Wert) bei `loop: true`; keine Animation einer Seitenansicht-Vorlage enthält `tilt`, `turn` oder `depth`; `punch` und `idle` unverändert gegenüber dem bisherigen Stand (Snapshot der Spuren im Test); `applyAnimationTemplate` übernimmt die Kanäle (Spuren der Bones laut Namen).
- [ ] **Schritt 2: Tests ausführen**, erwartet FAIL.
- [ ] **Schritt 3: Vorlagen anpassen** laut Regeln.
- [ ] **Schritt 4: Gesamtprüfung:** `npm test` in allen Paketen (klexel, rigsprite, shared, app), `npm run typecheck`, die drei Builds mit `verify-bundle` (Standard, nur Klexel, nur Rigsprite) wie in `docs/plans/2026-10-28-suite-workspace.md` Task 18 beschrieben; alles erwartet PASS. Sichtprüfung im Browser-Pane: Humanoid-Vorderansicht → „run“ abspielen; Beine schwingen zur Kamera und werden kürzer; „Tiefe sperren“ → Figur läuft flach; Export nach Klexel liefert Frames ohne Fehler. Commit: `feat: Vorder- und Rückansicht-Animationen nutzen Tiefe`.
