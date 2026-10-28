import { serializeProject, type Project } from './core/project';

const keys = new WeakMap<Project, string>();

/**
 * Günstiger Änderungsschlüssel eines Projekts für die Suite: Länge plus zwei 32-Bit-Hashes (FNV-1a und ein
 * Multiplikations-Hash) über serializeProject(p). Gleicher Inhalt → gleicher Schlüssel; verschiedener Inhalt →
 * praktisch immer verschieden.
 * Kosten: ein JSON.stringify und ein Durchlauf über die Zeichen, also linear in der Projektgröße (eingebettete
 * Bilder als data:-URLs dominieren; bei einigen MB Bilddaten wenige Millisekunden). Da der Store unveränderliche
 * Projekte hält, wird der Schlüssel je Projekt-Objekt zwischengespeichert: Wiederholte Aufrufe kosten nichts.
 */
export function projectChangeKey(p: Project): string {
  const cached = keys.get(p);
  if (cached !== undefined) return cached;
  const text = serializeProject(p);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15);
  }
  const key = `${text.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
  keys.set(p, key);
  return key;
}
