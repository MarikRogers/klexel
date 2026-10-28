// Prüft nach dem Bauen, welche Bereiche in apps/suite/dist stecken.
// Aufruf: node apps/suite/scripts/verify-bundle.mjs <erwartete Bereiche …>   z. B. `klexel` oder `klexel rigsprite`
// Jeder Bereich exportiert eine Konstante AREA_MARKER; deren Zeichenkette wird in den gebauten Dateien gesucht.
// Fehlt ein erwarteter Marker oder steckt der Marker eines abgeschalteten Bereichs im Bundle → Exit-Code 1.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Art → Marker-Zeichenkette (null = Marker noch nicht festgelegt, Prüfung wird mit Warnung übersprungen). */
const MARKERS = {
  klexel: 'AREA_MARKER_KLEXEL',
  rigsprite: null, // folgt mit der Einbindung von Rigsprite (Task 10)
};
/** Erwarteter App-Name im Manifest (wie appNameFor in src/areaNames.ts) */
const appName = areas => (areas.length === 1 && areas[0] === 'rigsprite' ? 'RigSprite' : 'Klexel');

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const expected = [...new Set(process.argv.slice(2).flatMap(a => a.split(',')).map(a => a.trim().toLowerCase()).filter(Boolean))];

const fail = msg => { console.error(`✗ ${msg}`); process.exitCode = 1; };

if (!expected.length) {
  console.error('Aufruf: node apps/suite/scripts/verify-bundle.mjs <erwartete Bereiche …> (z. B. klexel)');
  process.exit(2);
}
const unknown = expected.filter(a => !(a in MARKERS));
if (unknown.length) {
  console.error(`Unbekannte Bereiche: ${unknown.join(', ')}. Bekannt: ${Object.keys(MARKERS).join(', ')}`);
  process.exit(2);
}
if (!existsSync(dist)) {
  console.error(`Kein Build gefunden: ${dist}`);
  process.exit(2);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|mjs|css|html|webmanifest|json)$/.test(name)) yield p;
  }
}
const contents = [...files(dist)].map(p => ({ path: relative(dist, p), text: readFileSync(p, 'utf8') }));

for (const [kind, marker] of Object.entries(MARKERS)) {
  const want = expected.includes(kind);
  if (marker === null) {
    console.warn(`! ${kind}: Marker noch nicht festgelegt – Prüfung übersprungen`);
    continue;
  }
  const hits = contents.filter(c => c.text.includes(marker)).map(c => c.path);
  if (want && !hits.length) fail(`${kind}: erwartet, aber Marker ${marker} fehlt im Bundle`);
  else if (!want && hits.length) fail(`${kind}: abgeschaltet, aber Marker ${marker} steckt im Bundle (${hits.join(', ')})`);
  else console.log(`✓ ${kind}: ${want ? `enthalten (${hits.join(', ')})` : 'nicht enthalten'}`);
}

// Manifest-Name passend zur Auswahl
const mfPath = join(dist, 'manifest.webmanifest');
if (existsSync(mfPath)) {
  const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
  const name = appName(expected);
  if (mf.name !== name || mf.short_name !== name) fail(`Manifest heißt „${mf.name}"/„${mf.short_name}", erwartet „${name}"`);
  else console.log(`✓ Manifest: ${name}`);
} else fail('manifest.webmanifest fehlt');

if (process.exitCode) console.error('Bundle-Prüfung fehlgeschlagen');
else console.log(`Bundle-Prüfung bestanden (${expected.join(', ')})`);
