/**
 * Zentrale Stelle für externe Links der App ("Über Klexel").
 * Ein leerer Text ist ein Platzhalter: der Dialog zeigt dann "Link folgt in Kürze".
 * Nur http(s)-Adressen werden geöffnet.
 */
export const LINKS: Record<'support' | 'feedback' | 'privacy' | 'imprint', string> = {
  support: 'https://ko-fi.com/mariusschluesener',
  feedback: 'https://github.com/MarikRogers/klexel/issues',
  // Statische Seiten aus public/, vom Service Worker vorab gecacht
  privacy: 'https://marikrogers.github.io/klexel/datenschutz.html',
  imprint: 'https://marikrogers.github.io/klexel/impressum.html',
};
