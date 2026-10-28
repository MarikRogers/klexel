// Baut die App und veröffentlicht dist/ auf den Branch gh-pages (GitHub Pages).
// Aufruf: npm run deploy
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// npm ist unter Windows eine .cmd und braucht eine Shell; git nicht (sonst werden Argumente an Leerzeichen zerlegt).
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32', ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

if (out('git', ['status', '--porcelain'])) {
  console.error('Es gibt uncommittete Änderungen. Bitte erst committen, damit der Deploy einem Stand entspricht.');
  process.exit(1);
}
const remote = out('git', ['remote', 'get-url', 'origin']);
const rev = out('git', ['rev-parse', '--short', 'HEAD']);

run('npm', ['run', 'build']);

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
