// Prüft nach dem Bauen, welche Bereiche in apps/suite/dist stecken.
// Aufruf: node apps/suite/scripts/verify-bundle.mjs <erwartete Bereiche …>   z. B. `klexel` oder `klexel rigsprite`
// Jeder Bereich exportiert eine Konstante AREA_MARKER; deren Zeichenkette wird in den gebauten Dateien gesucht.
// Fehlt ein erwarteter Marker oder steckt der Marker eines abgeschalteten Bereichs im Bundle → Exit-Code 1.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKERS, appNameFor, cacheNameFor } from './bundleChecks.mjs';

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

const read = file => (existsSync(join(dist, file)) ? readFileSync(join(dist, file), 'utf8') : null);
// Bereiche ohne Marker sind im Bundle nicht nachweisbar: der Build kann sie zusätzlich enthalten (z. B. Standard-Build
// „klexel,rigsprite", solange Rigsprite keinen Marker hat). Name und Cache-Name dürfen zu jeder dieser Varianten passen.
const unmarked = Object.keys(MARKERS).filter(k => MARKERS[k] === null && !expected.includes(k));
const variants = unmarked.reduce((acc, k) => acc.flatMap(v => [v, [...v, k]]), [expected]);
const names = [...new Set(variants.map(appNameFor))];
const caches = [...new Set(variants.map(cacheNameFor))];
const name = names.join('" oder „');

// Manifest-Name passend zur Auswahl
const mfText = read('manifest.webmanifest');
if (mfText === null) fail('manifest.webmanifest fehlt');
else {
  const mf = JSON.parse(mfText);
  if (!names.includes(mf.name) || mf.short_name !== mf.name) fail(`Manifest heißt „${mf.name}"/„${mf.short_name}", erwartet „${name}"`);
  else console.log(`✓ Manifest: ${mf.name}`);
}

// Titel und Home-Bildschirm-Name in index.html
const html = read('index.html');
if (html === null) fail('index.html fehlt');
else {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const apple = html.match(/<meta name="apple-mobile-web-app-title" content="([^"]*)"/)?.[1];
  if (!names.includes(title) || apple !== title) fail(`index.html: Titel „${title}", apple-mobile-web-app-title „${apple}", erwartet „${name}"`);
  else console.log(`✓ index.html: ${title}`);
}

// Cache-Name des Service Workers
const sw = read('sw.js');
if (sw === null) fail('sw.js fehlt');
else {
  const got = sw.match(/const CACHE = '([^']*)';/)?.[1];
  if (!caches.includes(got)) fail(`sw.js: Cache „${got}", erwartet „${caches.join('" oder „')}"`);
  else if (sw.includes('const BUILD_ASSETS = [];')) fail('sw.js: BUILD_ASSETS nicht eingesetzt');
  else console.log(`✓ sw.js: Cache ${got}`);
}

if (process.exitCode) console.error('Bundle-Prüfung fehlgeschlagen');
else console.log(`Bundle-Prüfung bestanden (${expected.join(', ')})`);
