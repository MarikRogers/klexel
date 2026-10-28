import { describe, it, expect } from 'vitest';

// Die gemeinsame Schicht (@suite/shared) darf nichts aus Klexel, Rigsprite oder der Hülle importieren
// und ihr Paket nicht über relative Pfade verlassen. Geprüft werden alle Dateien unter packages/shared/src.
const files = import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Ziel eines Imports relativ zu packages/shared/src; beginnt es mit '..', liegt es außerhalb des Pakets. */
function resolve(fromFile: string, spec: string): string {
  const out: string[] = [];
  for (const p of ['workspace', ...fromFile.split('/').slice(0, -1), ...spec.split('/')]) {
    if (p === '.' || p === '') continue;
    if (p === '..' && out.length && out[out.length - 1] !== '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

describe('Workspace-Isolation', () => {
  const verboten = /(klexel|rigsprite|@suite\/app|(^|\/)shell(\/|$))/i;
  const specs = (src: string) =>
    [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  const schlecht = (f: string, s: string) => verboten.test(s) || (s.startsWith('.') && resolve(f, s).startsWith('..'));

  it('findet Dateien', () => {
    expect(Object.keys(files).length).toBeGreaterThan(3);
    expect(Object.keys(files).some(f => f.endsWith('/area.ts'))).toBe(true);
    // Die Prüfung selbst erkennt Ausbrüche aus dem Paket und Paketnamen der Bereiche
    expect(schlecht('../area.ts', '../../klexel/src/model/Document')).toBe(true);
    expect(schlecht('./store.ts', '../../../klexel/src/model/Document')).toBe(true);
    expect(schlecht('./store.ts', '@suite/klexel')).toBe(true);
    expect(schlecht('./store.ts', './types')).toBe(false);
    expect(schlecht('../area.ts', './workspace/types')).toBe(false);
  });

  for (const [f, src] of Object.entries(files)) {
    it(`${f} importiert nichts aus Klexel/Rigsprite`, () => {
      expect(specs(src).filter(s => schlecht(f, s))).toEqual([]);
    });
  }
});
