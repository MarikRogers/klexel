import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { ProjectKind } from '@suite/shared';
import { appNameFor, buildAreas, cacheNameFor } from './src/areaNames.ts';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function replaceOnce(text: string, from: string | RegExp, to: string, what: string): string {
  if (!(typeof from === 'string' ? text.includes(from) : from.test(text))) throw new Error(`Vorlage passt nicht: ${what}`);
  return text.replace(from, to);
}

/**
 * Aussehen und Service Worker je Build: Titel und Manifest-Namen nach der Bereichs-Auswahl, Cache-Name je Auswahl,
 * und die gebauten Dateien (auch nachgeladene Chunks) zum Vorab-Laden im Service Worker.
 * public/manifest.webmanifest und public/sw.js bleiben die Vorlagen.
 */
function areaBranding(areas: readonly ProjectKind[]): Plugin {
  const name = appNameFor(areas);
  let outDir = 'dist';
  let isBuild = false;
  let assets: string[] = [];
  return {
    name: 'suite-area-branding',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); isBuild = c.command === 'build'; },
    transformIndexHtml(html) {
      html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${name}</title>`, 'index.html <title>');
      return replaceOnce(html, /(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${name}$2`, 'apple-mobile-web-app-title');
    },
    generateBundle(_opts, bundle) {
      assets = Object.keys(bundle).filter(f => f.startsWith('assets/')).sort();
    },
    // Nach dem Kopieren von public/: Manifest und Service Worker in dist/ anpassen
    closeBundle() {
      if (!isBuild) return; // Entwicklungs-Server: public/ wird unverändert ausgeliefert
      const mf = join(outDir, 'manifest.webmanifest');
      // Nur die Namen ersetzen; sonst bleibt die Vorlage Zeichen für Zeichen erhalten
      let manifest = readFileSync(mf, 'utf8');
      manifest = replaceOnce(manifest, /("name":\s*")[^"]*(")/, `$1${name}$2`, 'manifest name');
      manifest = replaceOnce(manifest, /("short_name":\s*")[^"]*(")/, `$1${name}$2`, 'manifest short_name');
      JSON.parse(manifest); // muss gültiges JSON bleiben
      writeFileSync(mf, manifest);
      const swPath = join(outDir, 'sw.js');
      let sw = readFileSync(swPath, 'utf8');
      sw = replaceOnce(sw, /const CACHE = '[^']*';/, `const CACHE = '${cacheNameFor(areas)}';`, 'sw.js CACHE');
      sw = replaceOnce(sw, 'const BUILD_ASSETS = [];', `const BUILD_ASSETS = ${JSON.stringify(assets.map(a => `./${a}`))};`, 'sw.js BUILD_ASSETS');
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig(({ mode }) => {
  // VITE_AREAS aus der Umgebung oder einer .env-Datei; unbekannte Namen brechen den Build mit klarer Meldung ab
  const areas = buildAreas(loadEnv(mode, process.cwd(), 'VITE_').VITE_AREAS ?? process.env.VITE_AREAS);
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __AREAS__: JSON.stringify(areas),
      __AREA_KLEXEL__: JSON.stringify(areas.includes('klexel')),
      __AREA_RIGSPRITE__: JSON.stringify(areas.includes('rigsprite')),
    },
    plugins: [areaBranding(areas)],
  };
});
