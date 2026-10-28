import { describe, it, expect } from 'vitest';

// Die Workspace-Schicht darf nichts aus Klexel oder Rigsprite importieren
const files = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('Workspace-Isolation', () => {
  const verboten = /^(\.\.\/(model|storage|ui)(\/|$)|.*rigsprite)/i;
  const specs = (src: string) =>
    [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

  it('findet Dateien', () => { expect(Object.keys(files).length).toBeGreaterThan(3); });

  for (const [f, src] of Object.entries(files)) {
    it(`${f} importiert nichts aus Klexel/Rigsprite`, () => {
      expect(specs(src).filter(s => verboten.test(s))).toEqual([]);
    });
  }
});
