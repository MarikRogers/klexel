import type { WorkspaceStore } from '@suite/shared';
import { exportWorkspace, importWorkspace } from '@suite/shared';
import { saveBlob, showToast } from '@suite/shared/ui';
import { classifyProjectFile } from './classifyProjectFile';

export interface FileActions {
  exportAll(): Promise<void>;
  exportOne(id: string, name: string): Promise<void>;
  /** Liest eine Datei und fügt deren Projekte hinzu; liefert die Anzahl hinzugefügter Projekte. */
  importFile(file: File): Promise<number>;
}

export interface FileActionDeps {
  store: WorkspaceStore;
  /** Offenes Projekt sichern, damit die Datei den neuesten Stand enthält */
  prepare(): Promise<void>;
  isKnownKind(kind: string): boolean;
  validatePayload(kind: string, payload: unknown): boolean;
}

/** Dateiname ohne verbotene Zeichen (Windows/Unix), nie leer. */
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  let s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 80).trim();
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(s)) s = `_${s}`;
  return s || 'Projekt';
}

const MIME = 'application/json';

export function createFileActions(deps: FileActionDeps): FileActions {
  const { store } = deps;
  // Ohne frisch gesicherten Stand keine Datei schreiben
  const prepare = async () => {
    try { await deps.prepare(); } catch (err) {
      showToast('Speichern fehlgeschlagen – Datei nicht erstellt', 3000);
      throw err;
    }
  };
  /** Eigenständige Rigsprite-Projektdatei (Umzug aus dem alten Rigsprite): als neues Projekt, ohne es zu öffnen. */
  async function addRigspriteProject(raw: Record<string, unknown>): Promise<number> {
    if (!deps.isKnownKind('rigsprite')) {
      showToast('Diese Datei ist ein Rigsprite-Projekt, aber Rigsprite ist in dieser Version nicht enthalten.', 6000);
      return 0;
    }
    if (!deps.validatePayload('rigsprite', raw)) {
      showToast('Das Rigsprite-Projekt ist beschädigt und konnte nicht geladen werden', 5000);
      return 0;
    }
    try {
      const name = (typeof raw.name === 'string' ? raw.name.trim() : '').slice(0, 60).trim() || 'Unbenannt';
      await store.add({ kind: 'rigsprite', name, updatedAt: Date.now() }, raw);
      showToast('Rigsprite-Projekt hinzugefügt', 2500);
      return 1;
    } catch {
      showToast('Die Datei konnte nicht gespeichert werden', 5000);
      return 0;
    }
  }
  return {
    async exportAll() {
      await prepare();
      await saveBlob(await exportWorkspace(store), 'klexel-workspace.json', MIME);
    },
    async exportOne(id, name) {
      await prepare();
      await saveBlob(await exportWorkspace(store, [id]), `${sanitizeFileName(name)}.klexel.json`, MIME);
    },
    async importFile(file) {
      let text: string;
      try { text = await file.text(); } catch {
        showToast('Die Datei konnte nicht gelesen werden', 4000);
        return 0;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = undefined; }
      if (classifyProjectFile(parsed) === 'rigsprite-project') return addRigspriteProject(parsed as Record<string, unknown>);
      try {
        const r = await importWorkspace(store, text, deps.isKnownKind, deps.validatePayload);
        const n = r.added.length;
        let msg = n === 1 ? '1 Projekt hinzugefügt' : `${n} Projekte hinzugefügt`;
        if (r.rejected.length) {
          const list = r.rejected.map(x => `${x.name}: ${x.reason}`).join('; ');
          msg += `. Nicht übernommen (${r.rejected.length}): ${list}`;
        }
        showToast(msg, r.rejected.length ? 7000 : 2500);
        return n;
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Die Datei konnte nicht geladen werden', 5000);
        return 0;
      }
    },
  };
}
