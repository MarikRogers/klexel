// Erkennung eines Klexel-Links im #-Teil der Adresse, ohne ihn zu lesen (leicht und DOM-frei: auch für die
// Bereichs-Beschreibung, damit die Hülle bei einem Link zu Klexel wechseln kann, ohne den Editor zu laden).

/** Wert des Klexel-Links (`i=`) im #-Teil, sonst null. */
export function shareLinkValue(hash: string): string | null {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('i');
}

/** Enthält der #-Teil einen Klexel-Link (gültig oder nicht)? */
export function isShareLinkHash(hash: string): boolean {
  return shareLinkValue(hash) !== null;
}
