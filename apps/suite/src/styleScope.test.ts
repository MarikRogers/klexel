// Wächter: Die Styles eines Bereichs dürfen nur in dessen Wurzel wirken (.area-klexel / .area-rigsprite), die Hülle
// nur auf html/body und ihre eigenen Elemente. Die Stylesheets werden mit lightningcss geparst und die
// Verschachtelung aufgelöst (wie beim Bauen); danach wird jeder Selektor einzeln geprüft.
import { describe, it, expect } from 'vitest';
import { bundle, transform, type Selector } from 'lightningcss';

/**
 * Liest ein Stylesheet über lightningcss von der Platte (Vitest liefert CSS-Importe leer, auch mit ?raw; die Hülle
 * hat keine Node-Typen). Pfad relativ zu dieser Datei.
 */
function read(rel: string): string {
  const path = decodeURIComponent(new URL(rel, import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
  return new TextDecoder().decode(bundle({ filename: path }).code);
}
const klexelCss = read('../../../packages/klexel/src/style.css');
const rigspriteCss = read('../../../packages/rigsprite/src/ui/app.css');
const toastCss = read('../../../packages/shared/src/ui/toast.css');
const shellCss = read('./shell/shell.css');

/** Alle Selektoren eines Stylesheets nach dem Auflösen der Verschachtelung (Chrome 100 kennt kein Nesting). */
function selectors(css: string): Selector[] {
  const flat = transform({ filename: 'x.css', code: new TextEncoder().encode(css), targets: { chrome: 100 << 16 } }).code;
  const out: Selector[] = [];
  transform({ filename: 'x.css', code: flat, visitor: { Selector(s) { out.push(s); } } });
  return out;
}

const show = (s: Selector) => s.map(c => ('name' in c && c.name) || ('value' in c && c.value) || ('kind' in c && c.kind) || c.type).join('·');

/** Erster Teil (bis zum ersten Kombinator) und der Kombinator danach. */
function firstCompound(s: Selector) {
  const i = s.findIndex(c => c.type === 'combinator');
  return { compound: i < 0 ? s : s.slice(0, i), next: i < 0 ? null : (s[i] as { value: string }).value };
}

/**
 * Selektoren, die außerhalb der Wurzel .<rootClass> treffen könnten: Der erste Teil muss die Klasse der Wurzel
 * enthalten (trifft dann nur die Wurzel selbst) und darf nur über Nachfahren-/Kind-Kombinatoren weitergehen
 * (Geschwister der Wurzel liegen außerhalb).
 */
export function unscoped(css: string, rootClass: string): string[] {
  return selectors(css).filter(s => {
    const { compound, next } = firstCompound(s);
    const hasRoot = compound.some(c => c.type === 'class' && c.name === rootClass);
    return !hasRoot || (next !== null && next !== 'descendant' && next !== 'child');
  }).map(show);
}

/** Selektoren der Hülle, die nicht bei html/body, ihren eigenen Elementen oder einer Bereichs-Wurzel beginnen. */
function shellForeign(css: string): string[] {
  const own = (s: Selector): boolean => firstCompound(s).compound.some(c =>
    // :where(…)/:is(…): eigen, wenn jede Alternative eigen ist
    (c.type === 'pseudo-class' && (c.kind === 'where' || c.kind === 'is') && c.selectors.every(own)) ||
    (c.type === 'type' && (c.name === 'html' || c.name === 'body')) ||
    (c.type === 'id' && (c.name === 'projectsBtn' || c.name === 'projectsDlg')) ||
    (c.type === 'class' && (/^pl-/.test(c.name) || /^area-(klexel|rigsprite)$/.test(c.name) || c.name === 'toast')) ||
    (c.type === 'attribute' && c.name === 'data-area'));
  return selectors(css).filter(s => !own(s)).map(show);
}

describe('Styles der Bereiche bleiben in ihrer Wurzel', () => {
  it('Klexel (style.css) wirkt nur unter .area-klexel', () => {
    const css = klexelCss;
    expect(selectors(css).length).toBeGreaterThan(100);
    expect(unscoped(css, 'area-klexel')).toEqual([]);
  });

  it('Rigsprite (app.css) wirkt nur unter .area-rigsprite', () => {
    const css = rigspriteCss;
    expect(selectors(css).length).toBeGreaterThan(60);
    expect(unscoped(css, 'area-rigsprite')).toEqual([]);
  });

  it('Hülle (shell.css) gestaltet nur html/body, eigene Elemente und Platzierung je Bereichs-Wurzel', () => {
    expect(selectors(shellCss).length).toBeGreaterThan(40);
    expect(shellForeign(shellCss)).toEqual([]);
  });

  it('Hülle hängt nicht an den Variablen eines Bereichs (--fg, --accent, --panel, --bg)', () => {
    const css = shellCss + toastCss;
    expect(css).toContain('var(--shell-fg');
    expect(css.match(/var\(--(?!shell-)[\w-]+/g) ?? []).toEqual([]);
  });

  it('erkennt ungescopte Regeln (Gegenprobe)', () => {
    const sample = `
      .area-klexel { button { color: red; } & { font: 16px sans-serif; } }
      :root { --fg: #eee; }
      * { user-select: none; }
      html, body { overflow: hidden; }
      button { min-height: 44px; }
      [hidden] { display: none !important; }
      dialog label { display: block; }
      .area-klexel ~ div { color: red; }
      .area-klexelx button { color: red; }
      @media (orientation: landscape) { .row { gap: 4px; } }`;
    expect(unscoped(sample, 'area-klexel')).toEqual([
      'root', 'universal', 'html', 'body', 'button', 'hidden', 'dialog·descendant·label',
      'area-klexel·later-sibling·div', 'area-klexelx·descendant·button', 'row',
    ]);
    expect(shellForeign('button { color: red; } #projectsDlg button { color: red; } :where(#projectsDlg, dialog) b { color: red; }'))
      .toEqual(['button', 'where·descendant·b']);
  });
});
