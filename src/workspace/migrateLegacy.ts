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
  const meta = await store.create('klexel', 'Mein Bild', legacy);
  await store.setLastOpened(meta.id);
  await kv.set(MARKER, true);
  return 'migrated';
}
