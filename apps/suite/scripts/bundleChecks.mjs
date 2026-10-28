// Gemeinsame Daten der Bundle-Prüfung (verify-bundle.mjs). Ein Vitest-Test (src/bundleChecks.test.ts) gleicht sie mit
// den AREA_MARKER-Konstanten der Pakete und mit src/areaNames.ts ab, damit nichts auseinanderläuft.

/** Art → Marker-Zeichenkette (AREA_MARKER des jeweiligen Pakets). */
export const MARKERS = {
  klexel: 'AREA_MARKER_KLEXEL',
  rigsprite: 'AREA_MARKER_RIGSPRITE',
};

/**
 * Weitere Spuren eines Bereichs, die in Builds ohne ihn fehlen müssen (nur Abwesenheit wird geprüft):
 * Rigsprite bringt React (interner Name in react-dom) und seine Styles (.orbit-panel aus app.css, im Bundle als
 * `.area-rigsprite .orbit-panel`) mit, Klexel seine Styles (.selbar-row aus style.css, `.area-klexel .selbar-row`) und
 * seine Rückgabe-Annahme (Meldung aus fromFrames).
 * Die Hülle nennt beide Wurzel-Klassen selbst (Platzierung des Projekte-Knopfs); die sind daher keine Spur.
 */
export const TRACES = {
  klexel: ['.selbar-row', 'Pixeldaten passen nicht'],
  rigsprite: ['__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED', '.orbit-panel'],
};

const ALL = Object.keys(MARKERS);

/** App-Name je Auswahl (wie appNameFor in src/areaNames.ts) */
export function appNameFor(areas) {
  return areas.length === 1 && areas[0] === 'rigsprite' ? 'RigSprite' : 'Klexel';
}

/** Cache-Name des Service Workers je Auswahl (wie cacheNameFor in src/areaNames.ts) */
export function cacheNameFor(areas) {
  return ALL.every(a => areas.includes(a)) ? 'pixelart-v7' : `pixelart-${[...areas].sort().join('-')}-v7`;
}
