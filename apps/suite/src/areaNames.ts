// Bereichs-Auswahl beim Bauen (VITE_AREAS). Ohne Abhängigkeiten, damit auch vite.config.ts sie nutzen kann.
import type { ProjectKind } from '@suite/shared';

export const ALL_AREAS: readonly ProjectKind[] = ['klexel', 'rigsprite'];

/** Bereiche, die schon eingebunden sind; Rigsprite folgt (bis dahin ist ein Build nur mit Rigsprite nicht möglich). */
export const INTEGRATED_AREAS: readonly ProjectKind[] = ['klexel'];

/**
 * Liest VITE_AREAS: kommagetrennt, ohne Groß-/Kleinschreibung, Leerzeichen egal, Doppelte entfallen.
 * Nicht gesetzt → alle Bereiche. Leer oder unbekannter Name → Fehler.
 */
export function enabledAreas(env: string | undefined): ProjectKind[] {
  if (env === undefined) return [...ALL_AREAS];
  const names = env.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) {
    throw new Error(`VITE_AREAS ist leer. Erlaubt: ${ALL_AREAS.join(', ')} (kommagetrennt); ohne VITE_AREAS werden alle Bereiche gebaut.`);
  }
  const out: ProjectKind[] = [];
  for (const n of names) {
    if (!(ALL_AREAS as readonly string[]).includes(n)) {
      throw new Error(`Unbekannter Bereich „${n}" in VITE_AREAS. Erlaubt: ${ALL_AREAS.join(', ')}.`);
    }
    if (!out.includes(n as ProjectKind)) out.push(n as ProjectKind);
  }
  return out;
}

/** Prüft beim Bauen, dass mindestens ein eingebundener Bereich enthalten ist; liefert die Auswahl. */
export function buildAreas(env: string | undefined): ProjectKind[] {
  const areas = enabledAreas(env);
  if (!areas.some(a => INTEGRATED_AREAS.includes(a))) {
    throw new Error('Rigsprite ist noch nicht eingebunden: ein Build nur mit Rigsprite ist noch nicht möglich (VITE_AREAS enthält klexel nicht).');
  }
  return areas;
}

/** Name der App je Bereichs-Auswahl: nur Rigsprite → „RigSprite", sonst (Klexel oder beide) „Klexel". */
export function appNameFor(areas: readonly ProjectKind[]): string {
  return areas.length === 1 && areas[0] === 'rigsprite' ? 'RigSprite' : 'Klexel';
}

/**
 * Cache-Name des Service Workers je Bereichs-Auswahl. Der Standard-Build (alle Bereiche) behält „pixelart-v6",
 * jede andere Auswahl bekommt einen eigenen Namen, damit sich zwei Auslieferungen auf einer Adresse nie den Cache teilen.
 */
export function cacheNameFor(areas: readonly ProjectKind[]): string {
  const all = ALL_AREAS.every(a => areas.includes(a));
  return all ? 'pixelart-v6' : `pixelart-${[...areas].sort().join('-')}-v6`;
}
