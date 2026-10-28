// Gemeinsame Daten der Bundle-Prüfung (verify-bundle.mjs). Ein Vitest-Test (src/bundleChecks.test.ts) gleicht sie mit
// den AREA_MARKER-Konstanten der Pakete und mit src/areaNames.ts ab, damit nichts auseinanderläuft.

/** Art → Marker-Zeichenkette (null = Marker noch nicht festgelegt, Prüfung wird mit Warnung übersprungen). */
export const MARKERS = {
  klexel: 'AREA_MARKER_KLEXEL',
  rigsprite: null, // folgt mit der Einbindung von Rigsprite (Task 10)
};

const ALL = Object.keys(MARKERS);

/** App-Name je Auswahl (wie appNameFor in src/areaNames.ts) */
export function appNameFor(areas) {
  return areas.length === 1 && areas[0] === 'rigsprite' ? 'RigSprite' : 'Klexel';
}

/** Cache-Name des Service Workers je Auswahl (wie cacheNameFor in src/areaNames.ts) */
export function cacheNameFor(areas) {
  return ALL.every(a => areas.includes(a)) ? 'pixelart-v6' : `pixelart-${[...areas].sort().join('-')}-v6`;
}
