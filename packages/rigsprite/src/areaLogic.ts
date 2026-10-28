// DOM-freie Teile des Suite-Bereichs (testbar ohne React/DOM).
import type { Project } from './core/project';
import type { Transaction } from './state/store';

/** Laufen die globalen Tastenkürzel? Nur, wenn der Bereich aktiv ist und die Hülle ihn gerade bedienbar hält. */
export function shortcutsEnabled(active: boolean, hostActive: boolean): boolean {
  return active && hostActive;
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
