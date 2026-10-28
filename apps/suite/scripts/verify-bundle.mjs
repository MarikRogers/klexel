// Prüft nach dem Bauen, welche Bereiche in apps/suite/dist stecken.
// Aufruf: node apps/suite/scripts/verify-bundle.mjs <erwartete Bereiche …>   z. B. `klexel` oder `klexel rigsprite`
// Jeder Bereich exportiert eine Konstante AREA_MARKER; deren Zeichenkette wird in den gebauten Dateien gesucht.
// Fehlt ein erwarteter Marker oder steckt der Marker eines abgeschalteten Bereichs im Bundle → Exit-Code 1.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKERS, TRACES, appNameFor, cacheNameFor } from './bundleChecks.mjs';

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
  const hits = contents.filter(c => c.text.includes(marker)).map(c => c.path);
  if (want && !hits.length) fail(`${kind}: erwartet, aber Marker ${marker} fehlt im Bundle`);
  else if (!want && hits.length) fail(`${kind}: abgeschaltet, aber Marker ${marker} steckt im Bundle (${hits.join(', ')})`);
  else console.log(`✓ ${kind}: ${want ? `enthalten (${hits.join(', ')})` : 'nicht enthalten'}`);
  if (want) continue;
  for (const trace of TRACES[kind] ?? []) {
    const found = contents.filter(c => c.text.includes(trace)).map(c => c.path);
    if (found.length) fail(`${kind}: abgeschaltet, aber „${trace}" steckt im Bundle (${found.join(', ')})`);
  }
}

const read = file => (existsSync(join(dist, file)) ? readFileSync(join(dist, file), 'utf8') : null);
// Name und Cache-Name genau zur erwarteten Auswahl
const name = appNameFor(expected);
const cache = cacheNameFor(expected);

// Manifest-Name passend zur Auswahl
const mfText = read('manifest.webmanifest');
if (mfText === null) fail('manifest.webmanifest fehlt');
else {
  const mf = JSON.parse(mfText);
  if (mf.name !== name || mf.short_name !== name) fail(`Manifest heißt „${mf.name}"/„${mf.short_name}", erwartet „${name}"`);
  else console.log(`✓ Manifest: ${mf.name}`);
}

// Titel und Home-Bildschirm-Name in index.html
const html = read('index.html');
if (html === null) fail('index.html fehlt');
else {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const apple = html.match(/<meta name="apple-mobile-web-app-title" content="([^"]*)"/)?.[1];
  if (title !== name || apple !== name) fail(`index.html: Titel „${title}", apple-mobile-web-app-title „${apple}", erwartet „${name}"`);
  else console.log(`✓ index.html: ${title}`);
}

// Cache-Name des Service Workers
const sw = read('sw.js');
if (sw === null) fail('sw.js fehlt');
else {
  const got = sw.match(/const CACHE = '([^']*)';/)?.[1];
  if (got !== cache) fail(`sw.js: Cache „${got}", erwartet „${cache}"`);
  else if (sw.includes('const BUILD_ASSETS = [];')) fail('sw.js: BUILD_ASSETS nicht eingesetzt');
  else console.log(`✓ sw.js: Cache ${got}`);
}

if (process.exitCode) console.error('Bundle-Prüfung fehlgeschlagen');
else console.log(`Bundle-Prüfung bestanden (${expected.join(', ')})`);
