import type { WorkspaceStore } from './store';
import type { KvBackend } from './types';

const MARKER = 'ws:migrated';

// Übernimmt den alten Einzel-Stand einmalig als Projekt. Der Alt-Eintrag wird nur gelesen, nie verändert.
export async function migrateLegacy(
  store: WorkspaceStore,
  kv: KvBackend,
  readLegacyKlexel: () => Promise<unknown | null>,
): Promise<'migrated' | 'none' | 'done-before'> {
  if (await kv.get(MARKER)) return 'done-before';
  const legacy = await readLegacyKlexel();
  if (legacy === null || legacy === undefined) return 'none';
  // Zweite Prüfung direkt vor dem Anlegen verengt das Zwei-Tab-Rennen; ganz geschlossen ist es bewusst nicht
  // (Restlücke: zwei Tabs prüfen gleichzeitig vor dem Marker und legen beide ein Projekt an).
  if (await kv.get(MARKER)) return 'done-before';
  const meta = await store.create('klexel', 'Mein Bild', legacy);
  // Marker sofort nach dem Anlegen, damit ein Fehler bei setLastOpened kein Duplikat beim Neustart erzeugt
  await kv.set(MARKER, meta.id);
  await store.setLastOpened(meta.id);
  return 'migrated';
}
