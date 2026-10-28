// Gemeinsame Daten der Bundle-Prüfung (verify-bundle.mjs). Ein Vitest-Test (src/bundleChecks.test.ts) gleicht sie mit
// den AREA_MARKER-Konstanten der Pakete und mit src/areaNames.ts ab, damit nichts auseinanderläuft.

/** Art → Marker-Zeichenkette (AREA_MARKER des jeweiligen Pakets). */
export const MARKERS = {
  klexel: 'AREA_MARKER_KLEXEL',
  rigsprite: 'AREA_MARKER_RIGSPRITE',
};

/**
 * Weitere Spuren eines Bereichs, die in Builds ohne ihn fehlen müssen (nur Abwesenheit wird geprüft):
 * Rigsprite bringt React (interner Name in react-dom) und seine Styles (.orbit-panel aus app.css) mit.
 */
export const TRACES = {
  klexel: [],
  rigsprite: ['__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED', '.orbit-panel'],
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
