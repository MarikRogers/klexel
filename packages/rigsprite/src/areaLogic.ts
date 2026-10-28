// DOM-freie Teile des Suite-Bereichs (testbar ohne React/DOM).
import type { SourceService } from '@suite/shared';
import { refreshLinkedImages } from './core/linkedSprites';
import type { Project } from './core/project';
import type { Transaction } from './state/store';

/**
 * Laufen die globalen Tastenkürzel? Nur, wenn der Bereich aktiv ist, die Hülle ihn gerade bedienbar hält und kein
 * modaler Dialog offen ist (Projektliste und Rückfragen der Hülle sind <dialog>; wie Klexel).
 */
export function shortcutsEnabled(active: boolean, hostActive: boolean, dialogOpen = false): boolean {
  return active && hostActive && !dialogOpen;
}

interface ProjectState {
  project: Project;
  transaction: Transaction | null;
}

interface SubscribableStore<S> {
  subscribe(listener: (state: S, prev: S) => void): () => void;
}

/**
 * Ruft onChange genau einmal je echter Änderung von state.project (neue Referenz). Ansichts-Zustand (Kamera,
 * Auswahl, Wiedergabe) zählt nicht. Während einer Transaktion (z. B. Ziehen im Viewport) wird nichts gemeldet;
 * beim Abschluss einmal, falls sich das Projekt gegenüber dem Beginn geändert hat (Abbruch: keine Meldung).
 */
export function watchProjectChanges<S extends ProjectState>(store: SubscribableStore<S>, onChange: () => void): () => void {
  return store.subscribe((state, prev) => {
    if (state.transaction) return;
    const before = prev.transaction ? prev.transaction.startProject : prev.project;
    if (state.project !== before) onChange();
  });
}

/** Ids of the source projects the images of `p` link to (each once, in first-seen order). */
export function linkedSourceIds(p: Project): string[] {
  const ids = new Set<string>();
  for (const img of Object.values(p.images)) if (img.source) ids.add(img.source.projectId);
  return [...ids];
}

/** Where a sync reads and writes the project (the editor store in the area). */
export interface LinkedSyncTarget {
  /** The current project (read anew for every apply). */
  getProject(): Project;
  /** Sets a refreshed project (store: applyLinkedUpdate - no undo entry, but reported). */
  apply(project: Project): void;
  /** True once the result must be dropped (e.g. another project was opened meanwhile). */
  isStale?(): boolean;
}

export interface LinkedSyncSummary {
  /** Images with new pixels */
  updated: number;
  /** Images newly marked "Quelle fehlt" */
  missing: number;
  /** Images added for new frames */
  added: number;
  /** Source projects that could not be read (project left unchanged for them) */
  failed: number;
}

/**
 * Brings the linked images of the target's project up to date with their Klexel sources: every distinct
 * source.projectId is read once (in parallel). Each result is applied to the project as it is at that moment
 * (not the one the read started from), so edits made while reading are kept. A source that has no linked image
 * left by then is skipped (no re-adding after the user removed the link). A failed read is reported via onError
 * and changes nothing. Without a source service (Klexel not in this build) nothing happens.
 */
export async function syncLinkedSources(
  sources: SourceService | undefined,
  target: LinkedSyncTarget,
  onError: (err: unknown, projectId: string) => void = () => undefined,
): Promise<LinkedSyncSummary> {
  const sum: LinkedSyncSummary = { updated: 0, missing: 0, added: 0, failed: 0 };
  if (!sources) return sum;
  await Promise.all(
    linkedSourceIds(target.getProject()).map(async (id) => {
      let result;
      try {
        result = await sources.read(id);
      } catch (err) {
        sum.failed++;
        onError(err, id);
        return;
      }
      if (target.isStale?.()) return;
      const cur = target.getProject();
      if (!linkedSourceIds(cur).includes(id)) return;
      const r = refreshLinkedImages(cur, id, result);
      if (r.project === cur) return;
      target.apply(r.project);
      sum.updated += r.updated.length;
      sum.missing += r.missing.length;
      sum.added += r.added.length;
    }),
  );
  return sum;
}
