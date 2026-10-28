import { get, set } from 'idb-keyval';
import { FILE_UNREADABLE } from '../core/messages';
import { sanitizeFileName } from '../core/export';
import { parseProject, serializeProject, type ParseResult, type Project } from '../core/project';
import { download } from '../dom/download';
import { useEditor } from './store';

export const AUTOSAVE_KEY = 'rigsprite:autosave';

type Store = typeof useEditor;

/** Saves the project (debounced) whenever its reference changes. Returns an unsubscribe function. */
export function startAutosave(store: Store = useEditor, delayMs = 1000): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;

  const write = () => {
    timer = undefined;
    pending = false;
    set(AUTOSAVE_KEY, serializeProject(store.getState().project)).catch((e) =>
      console.warn('Autosave fehlgeschlagen', e),
    );
  };
  const flush = () => {
    if (pending) {
      clearTimeout(timer);
      write();
    }
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(write, delayMs);
  });
  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', flush);

  return () => {
    unsubscribe();
    clearTimeout(timer);
    pending = false;
    window.removeEventListener('beforeunload', flush);
    window.removeEventListener('pagehide', flush);
  };
}

/** Loads the autosaved project, if present and valid. */
export async function restoreAutosave(store: Store = useEditor): Promise<boolean> {
  try {
    const text = await get(AUTOSAVE_KEY);
    if (typeof text !== 'string') return false;
    const res = parseProject(text);
    if (!res.ok) return false;
    store.getState().loadProject(res.project);
    return true;
  } catch (e) {
    console.warn('Autosave konnte nicht gelesen werden', e);
    return false;
  }
}

/** Reads and validates a project file. */
export async function readProjectFile(file: File): Promise<ParseResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: FILE_UNREADABLE };
  }
  return parseProject(text);
}

/** Returns null on success, otherwise an error message. The project stays untouched on failure. */
export async function openProjectFile(file: File, store: Store = useEditor): Promise<string | null> {
  const res = await readProjectFile(file);
  if (!res.ok) return res.error;
  store.getState().loadProject(res.project);
  return null;
}

/** Downloads the project as `<name>.rigsprite.json`. */
export function downloadProject(project: Project): void {
  download(
    new Blob([serializeProject(project)], { type: 'application/json' }),
    `${sanitizeFileName(project.name)}.rigsprite.json`,
  );
}
