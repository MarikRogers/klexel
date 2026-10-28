import type { WorkspaceStore } from './store';
import type { KvBackend, ProjectKind } from './types';

/** Marker je Art; Klexel behält den ursprünglichen Schlüssel, damit bestehende Workspaces nicht erneut übernehmen. */
const markerFor = (kind: ProjectKind) => (kind === 'klexel' ? 'ws:migrated' : `ws:migrated:${kind}`);

// Übernimmt den alten Einzel-Stand einer Art einmalig als Projekt. Der Alt-Eintrag wird nur gelesen, nie verändert.
export async function migrateLegacy(
  store: WorkspaceStore,
  kv: KvBackend,
  readLegacy: () => Promise<unknown | null>,
  opts: { kind?: ProjectKind; name?: string } = {},
): Promise<'migrated' | 'none' | 'done-before'> {
  const kind = opts.kind ?? 'klexel';
  const marker = markerFor(kind);
  if (await kv.get(marker)) return 'done-before';
  const legacy = await readLegacy();
  if (legacy === null || legacy === undefined) return 'none';
  // Zweite Prüfung direkt vor dem Anlegen verengt das Zwei-Tab-Rennen; ganz geschlossen ist es bewusst nicht
  // (Restlücke: zwei Tabs prüfen gleichzeitig vor dem Marker und legen beide ein Projekt an).
  if (await kv.get(marker)) return 'done-before';
  const meta = await store.create(kind, opts.name ?? 'Mein Bild', legacy);
  // Marker sofort nach dem Anlegen, damit ein Fehler bei setLastOpened kein Duplikat beim Neustart erzeugt
  await kv.set(marker, meta.id);
  await store.setLastOpened(meta.id);
  return 'migrated';
}
