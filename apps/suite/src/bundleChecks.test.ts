import { describe, it, expect } from 'vitest';
// Testdatei: darf das Paket direkt lesen (der Isolationstest gilt nur für Quelltext der Hülle)
import { AREA_MARKER as KLEXEL_MARKER } from '@suite/klexel';
import { AREA_MARKER as RIGSPRITE_MARKER } from '@suite/rigsprite';
import { MARKERS, TRACES, appNameFor, cacheNameFor } from '../scripts/bundleChecks.mjs';
import * as names from './areaNames';

describe('Daten der Bundle-Prüfung', () => {
  it('Marker stimmen mit den Paketen überein', () => {
    expect(MARKERS.klexel).toBe(KLEXEL_MARKER);
    expect(MARKERS.rigsprite).toBe(RIGSPRITE_MARKER);
    expect(Object.values(MARKERS).every(m => typeof m === 'string' && m.length > 0)).toBe(true);
    expect(Object.keys(MARKERS).sort()).toEqual([...names.ALL_AREAS].sort());
    expect(Object.keys(TRACES).sort()).toEqual([...names.ALL_AREAS].sort());
  });
  it('Name und Cache-Name wie in areaNames.ts', () => {
    for (const a of [['klexel'], ['rigsprite'], ['klexel', 'rigsprite'], ['rigsprite', 'klexel']] as const) {
      expect(appNameFor(a)).toBe(names.appNameFor(a));
      expect(cacheNameFor(a)).toBe(names.cacheNameFor(a));
    }
  });
});
