// Wann Klexel einen Link aus dem #-Teil öffnet (DOM-frei, testbar): nur, solange der Bereich aktiv ist (sichtbar,
// bedienbar, kein Wechsel der Hülle läuft). Sonst läge der modale Link-Dialog in einem verdeckten/inerten Container
// und machte – scheitert der Wechsel – die ganze Seite unbedienbar.

export interface LinkGate {
  /** Beim Einhängen: aktiv → sofort lesen; sonst (Einhängen während eines Wechsels) bis zum Aktivieren vormerken. */
  mounted(): void;
  /** hashchange: nur im aktiven Bereich. Verdeckt wechselt die Hülle selbst und ruft danach follow(). */
  hashChanged(): void;
  /** setActive(true): Vorgemerktes jetzt lesen (falls der Bereich wirklich aktiv ist). */
  activated(): void;
  /** Aufruf der Hülle (AreaHandle.followLink) nach dem Wechsel; inaktiv → vormerken. */
  follow(): void;
}

export function createLinkGate(isActive: () => boolean, open: () => void): LinkGate {
  let pending = false;
  const openOrDefer = () => {
    if (isActive()) { pending = false; open(); } else pending = true;
  };
  return {
    mounted: openOrDefer,
    hashChanged: () => { if (isActive()) { pending = false; open(); } },
    activated: () => { if (pending && isActive()) { pending = false; open(); } },
    follow: openOrDefer,
  };
}
