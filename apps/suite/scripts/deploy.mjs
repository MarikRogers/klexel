// Baut die App und veröffentlicht dist/ auf den Branch gh-pages (GitHub Pages).
// Aufruf: npm run deploy [-- --areas klexel,rigsprite] [--dry-run]
//   --areas    enthaltene Bereiche (wird als VITE_AREAS an den Build gegeben); ohne Angabe gilt VITE_AREAS aus der
//              Umgebung, sonst alle Bereiche. Die Auswahl wird immer ausdrücklich gesetzt, ein VITE_AREAS aus .env-Dateien
//              gilt beim Deploy also nicht (Build und Bundle-Prüfung sehen sicher dieselbe Auswahl).
//   --dry-run  nur bauen und das Bundle prüfen, nichts veröffentlichen (kein git init/commit/push)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function parseArgs(argv) {
  const opts = { areas: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--areas') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error('--areas braucht einen Wert, z. B. --areas klexel');
      opts.areas = v;
    } else if (a.startsWith('--areas=')) opts.areas = a.slice('--areas='.length);
    else throw new Error(`Unbekanntes Argument: ${a}. Erlaubt: --areas <bereiche>, --dry-run`);
  }
  return opts;
}

let opts;
try { opts = parseArgs(process.argv.slice(2)); } catch (err) {
  console.error(err.message);
  process.exit(1);
}
// Hat npm selbst ein --dry-run geschluckt (z. B. `npm run deploy --dry-run` ohne `--`), kommt es nur als
// npm_config_dry_run an: dann ebenfalls nichts veröffentlichen.
const npmDryRun = process.env.npm_config_dry_run;
if (npmDryRun !== undefined && npmDryRun !== '' && npmDryRun !== 'false') {
  console.warn('Hinweis: --dry-run kam bei npm an (npm_config_dry_run) – Probelauf, nichts wird veröffentlicht.');
  opts.dryRun = true;
}

// npm ist unter Windows eine .cmd und braucht eine Shell; git nicht (sonst werden Argumente an Leerzeichen zerlegt).
const run = (cmd, args, o = {}) => execFileSync(cmd, args, { stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32', ...o });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

if (out('git', ['status', '--porcelain'])) {
  if (!opts.dryRun) {
    console.error('Es gibt uncommittete Änderungen. Bitte erst committen, damit der Deploy einem Stand entspricht.');
    process.exit(1);
  }
  console.warn('Hinweis: uncommittete Änderungen (für --dry-run erlaubt).');
}
const rev = out('git', ['rev-parse', '--short', 'HEAD']);

// Auswahl immer ausdrücklich setzen (Umgebung schlägt .env in Vite), damit Build und Prüfung dieselbe sehen
const areas = opts.areas ?? process.env.VITE_AREAS ?? 'klexel,rigsprite';
const env = { ...process.env, VITE_AREAS: areas };
delete env.npm_config_dry_run; // nicht an das innere npm weiterreichen
console.log(`Bereiche: ${areas}`);
try {
  run('npm', ['run', 'build'], { env });
  const expected = areas.split(',').map(s => s.trim()).filter(Boolean);
  run(process.execPath, ['scripts/verify-bundle.mjs', ...expected]);
} catch {
  console.error('Build oder Bundle-Prüfung fehlgeschlagen – nichts veröffentlicht.');
  process.exit(1);
}

if (opts.dryRun) {
  console.log(`Probelauf (--dry-run): Build ${rev} liegt in dist/, nichts veröffentlicht.`);
  process.exit(0);
}

const remote = out('git', ['remote', 'get-url', 'origin']);
const tmp = mkdtempSync(join(tmpdir(), 'pixelart-pages-'));
try {
  cpSync('dist', tmp, { recursive: true });
  writeFileSync(join(tmp, '.nojekyll'), '');
  const git = args => run('git', args, { cwd: tmp });
  git(['init', '-b', 'gh-pages']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '-A']);
  git(['commit', '-m', `Deploy ${rev}`]);
  git(['push', '--force', remote, 'gh-pages']);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('Veröffentlicht: Branch gh-pages');
