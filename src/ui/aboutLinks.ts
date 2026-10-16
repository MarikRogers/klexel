export type LinkAction = 'open' | 'placeholder' | 'offline';

/**
 * Entscheidet, was ein Link im Dialog "Über Klexel" tun soll.
 * Nur http(s) gilt als echter Link; alles andere (leer, javascript:, data: …) ist ein Platzhalter.
 */
export function linkAction(url: string, online: boolean): LinkAction {
  if (!/^https?:\/\/\S+$/i.test(url.trim())) return 'placeholder';
  return online ? 'open' : 'offline';
}
