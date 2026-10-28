import { MAX_IMAGE_SIZE } from '@suite/shared';
import type { ProjectMeta } from '@suite/shared';

/** „Unbenannt", sonst die kleinste freie Nummer („Unbenannt 2", …). */
export function nextUntitledName(existing: string[], base = 'Unbenannt'): string {
  const names = new Set(existing);
  if (!names.has(base)) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Filtert nach Teilstring im Namen, ohne Groß-/Kleinschreibung; leere Suche liefert alles. */
export function filterProjects(list: ProjectMeta[], query: string): ProjectMeta[] {
  const q = query.trim().toLocaleLowerCase('de');
  if (!q) return list;
  return list.filter(m => m.name.toLocaleLowerCase('de').includes(q));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** „Heute, 14:05", „Gestern, 09:12" oder „28.10.2026" (Ortszeit). */
export function formatUpdated(ts: number, now = Date.now()): string {
  const d = new Date(ts), today = new Date(now);
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (ts >= dayStart && ts < dayStart + 86_400_000) return `Heute, ${time}`;
  const yStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime();
  if (ts >= yStart && ts < dayStart) return `Gestern, ${time}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Bildgröße aus einem Eingabefeld: ganze Zahl 1..MAX_IMAGE_SIZE, sonst null. */
export function parseSize(v: string): number | null {
  if (!/^\s*\d+\s*$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= MAX_IMAGE_SIZE ? n : null;
}

/** Lässt sich das Projekt in diesem Build öffnen? Nur, wenn ein Bereich seiner Art enthalten ist. */
export function isOpenable(meta: ProjectMeta, kinds: readonly string[]): boolean {
  return kinds.includes(meta.kind);
}

/** Kennzeichen eines Eintrags in der Projektliste (Art, „geöffnet", „nicht verfügbar"). kindLabel = Art zuerst. */
export function projectBadges(
  meta: ProjectMeta, currentId: string | null, usable: boolean, kindLabel?: string | null,
): Array<{ text: string; off: boolean; kind?: true }> {
  const out: Array<{ text: string; off: boolean; kind?: true }> = [];
  if (kindLabel) out.push({ text: kindLabel, off: false, kind: true });
  if (meta.id === currentId) out.push({ text: 'geöffnet', off: false });
  if (!usable) out.push({ text: 'nicht verfügbar', off: true });
  return out;
}

/**
 * Nach einem Fehler beim Löschen des offenen Projekts: Existiert es noch (oder lässt sich das nicht feststellen),
 * bleibt es geöffnet und wird weiter gesichert ('restore'); ist es weg, wird ein anderes geöffnet ('fallback').
 */
export function afterRemoveError(removedId: string, listAfter: ProjectMeta[] | null): 'restore' | 'fallback' {
  if (listAfter === null) return 'restore';
  return listAfter.some(m => m.id === removedId) ? 'restore' : 'fallback';
}

/** Anzeigenamen der Projekt-Arten, auch für Arten ohne Bereich in diesem Build. */
const KIND_TITLES: Record<string, string> = { klexel: 'Klexel', rigsprite: 'Rigsprite' };

/** Anzeigename einer Art: aus der Bereichs-Beschreibung, sonst bekannt, sonst die Art selbst. */
export function kindTitle(kind: string, titles: Readonly<Record<string, string>> = {}): string {
  return titles[kind] ?? KIND_TITLES[kind] ?? kind;
}

/**
 * Art-Kennzeichen eines Eintrags: nur, wenn der Build mehrere Bereiche hat (sonst wäre es überall gleich) oder
 * das Projekt nicht geöffnet werden kann (dann sagt es, welcher Bereich fehlt).
 */
export function kindBadge(meta: ProjectMeta, enabledKinds: readonly string[], usable: boolean, titles: Readonly<Record<string, string>> = {}): string | null {
  return enabledKinds.length > 1 || !usable ? kindTitle(meta.kind, titles) : null;
}

/** Vorgewählte Art für „Neues Projekt": die des offenen Projekts, sonst die erste des Builds. */
export function defaultNewKind(current: string | null, enabledKinds: readonly string[]): string | undefined {
  return current !== null && enabledKinds.includes(current) ? current : enabledKinds[0];
}

/** Artwahl im Dialog „Neues Projekt" nur bei mehr als einem Bereich. */
export function showKindChoice(enabledKinds: readonly string[]): boolean {
  return enabledKinds.length > 1;
}
