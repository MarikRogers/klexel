import { MAX_SIZE } from '../model/Document';
import type { ProjectMeta } from '../workspace/types';

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

/** Bildgröße aus einem Eingabefeld: ganze Zahl 1..MAX_SIZE, sonst null. */
export function parseSize(v: string): number | null {
  if (!/^\s*\d+\s*$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= MAX_SIZE ? n : null;
}
