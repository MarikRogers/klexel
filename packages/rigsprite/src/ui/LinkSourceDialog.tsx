import { useEffect, useRef, useState } from 'react';
import type { ProjectMeta, SourceMode, SourceService } from '@suite/shared';
import { linkModeConflict } from '../core/linkedSprites';
import { errorMessage } from '../core/messages';
import { useEditor } from '../state/store';
import { useEscape } from './shortcuts';

const formatDate = (t: number) => {
  try {
    return new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
};

type ListState = { status: 'loading' } | { status: 'ready'; projects: ProjectMeta[] } | { status: 'error'; message: string };

/**
 * Picks a Klexel project and links its frames - or, on request, its layers - as sprites (one image per frame or
 * layer, auto-attached by name).
 * Linking is a normal edit (one undo step, store.linkSource); later refreshes are not (applyLinkedUpdate).
 */
export function LinkSourceDialog({
  sources,
  onClose,
  onLinked,
}: {
  sources: SourceService;
  onClose: () => void;
  /** Called after linking with the number of added sprites and the source project's name. */
  onLinked: (added: number, projectName: string) => void;
}) {
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<SourceMode>('frames');
  const [error, setError] = useState<string | null>(null);
  // Closed (Escape, Abbrechen, unmounted) while a read is pending: its result must not link anything anymore
  const closed = useRef(false);
  const cancel = () => {
    closed.current = true;
    onClose();
  };
  useEscape(true, cancel);
  useEffect(() => {
    closed.current = false; // StrictMode mounts twice
    return () => {
      closed.current = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    sources.list().then(
      (projects) => !cancelled && setList({ status: 'ready', projects }),
      (e: unknown) => !cancelled && setList({ status: 'error', message: errorMessage(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [sources]);

  const pick = async (m: ProjectMeta) => {
    setBusy(true);
    setError(null);
    try {
      if (linkModeConflict(useEditor.getState().project, m.id, mode)) {
        setError(
          mode === 'layers'
            ? `„${m.name}" ist bereits als Frames verknüpft. Entferne zuerst die verknüpften Sprites.`
            : `„${m.name}" ist bereits als Ebenen verknüpft. Entferne zuerst die verknüpften Sprites.`,
        );
        return;
      }
      const result = await sources.read(m.id, mode);
      if (closed.current) return;
      if (!result) {
        setError(`„${m.name}" ist nicht mehr vorhanden oder nicht lesbar`);
        return;
      }
      const added = useEditor.getState().linkSource(m.id, result);
      onLinked(added.length, result.projectName || m.name);
      onClose();
    } catch (e) {
      if (closed.current) return;
      setError(`Klexel-Projekt konnte nicht gelesen werden: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog link-source-dialog" role="dialog" aria-label="Sprites aus Klexel">
        <h2>Sprites aus Klexel</h2>
        <div className="link-source-mode" role="group" aria-label="Quelle der Sprites">
          <button aria-pressed={mode === 'frames'} className={mode === 'frames' ? 'active' : ''} onClick={() => setMode('frames')}>
            Frames
          </button>
          <button aria-pressed={mode === 'layers'} className={mode === 'layers' ? 'active' : ''} onClick={() => setMode('layers')}>
            Ebenen
          </button>
        </div>
        <p className="hint">
          {mode === 'frames'
            ? 'Jeder Frame wird ein Sprite und bleibt mit Klexel verknüpft.'
            : 'Jede Ebene (aus dem ersten Frame) wird ein Sprite und bleibt mit Klexel verknüpft.'}
        </p>
        {list.status === 'loading' && <p role="status">Lade Klexel-Projekte …</p>}
        {list.status === 'error' && (
          <div role="alert" className="error">
            Klexel-Projekte konnten nicht geladen werden: {list.message}
          </div>
        )}
        {list.status === 'ready' && list.projects.length === 0 && <p role="status">Keine Klexel-Projekte vorhanden</p>}
        {list.status === 'ready' && list.projects.length > 0 && (
          <ul className="link-source-list">
            {list.projects.map((m) => (
              <li key={m.id}>
                <button className="link-source-item" disabled={busy} onClick={() => void pick(m)}>
                  <span className="link-source-name">{m.name}</span>
                  <span className="link-source-date">{formatDate(m.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div className="dialog-actions">
          <button onClick={cancel}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
