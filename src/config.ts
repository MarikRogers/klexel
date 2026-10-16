/**
 * Zentrale Stelle für externe Links der App ("Über Klexel").
 * Ein leerer Text ist ein Platzhalter: der Dialog zeigt dann "Link folgt in Kürze".
 * Nur http(s)-Adressen werden geöffnet.
 */
export const LINKS: Record<'support' | 'feedback' | 'privacy' | 'imprint', string> = {
  // TODO: Spendenlink eintragen, z. B. 'https://ko-fi.com/<dein-name>'
  support: '',
  feedback: 'https://github.com/MarikRogers/klexel/issues',
  // TODO: Datenschutzerklärung eintragen (Seite oder Dokument)
  privacy: '',
  // TODO: Impressum eintragen (in Deutschland meist Pflicht, sobald Spenden angenommen werden)
  imprint: '',
};
