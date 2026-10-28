// Einhängbarer Bereich Rigsprite für die Suite (samt React und Styles). Wird nur über rigspriteDescriptor.load()
// dynamisch geladen, damit Editor und Styles ein eigener Chunk bleiben (und in Builds ohne Rigsprite ganz fehlen).
import './ui/app.css';
import { createRoot } from 'react-dom/client';
import type { Area, AreaHandle, AreaHost } from '@suite/shared';
import type { Project } from './core/project';
import { shortcutsEnabled, watchProjectChanges } from './areaLogic';
import { AREA_MARKER } from './marker';
import { useEditor } from './state/store';
import { AppView } from './ui/App';
import { setShortcutGate } from './ui/shortcuts';
import type { SuiteBridge } from './ui/suiteBridge';
import { captureViewport } from './ui/viewportCapture';
// In der Suite liegt das Logo nicht in deren public/: als Asset des Bereichs-Chunks mitliefern
import logoUrl from '../public/logo.png';

/** Größte Kantenlänge der Vorschau in der Projektliste (CSS zeigt sie mit 56 px; doppelt für hohe Pixeldichte). */
const THUMB_MAX = 112;

/** Verkleinertes PNG der übereinanderliegenden Viewport-Ebenen; undefined, wenn nichts Sinnvolles vorliegt. */
export function thumbnailOf(layers: readonly HTMLCanvasElement[] | null, max = THUMB_MAX): string | undefined {
  const base = layers?.[0];
  if (!layers || !base || base.width < 8 || base.height < 8) return undefined;
  try {
    const scale = Math.min(1, max / Math.max(base.width, base.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(base.width * scale));
    c.height = Math.max(1, Math.round(base.height * scale));
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    for (const l of layers) ctx.drawImage(l, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

/**
 * Hängt Rigsprite in root ein. Gespeichert wird nicht hier (kein eigener Autosave): jede Änderung des Projekts
 * meldet host.onChange(), die Hülle holt sich snapshot(). Der Editor-Store ist ein Modul-Singleton: es gibt
 * höchstens eine eingehängte Instanz.
 */
export function mountRigsprite(root: HTMLElement, host: AreaHost): AreaHandle<Project> {
  let active = true;
  // Beim Öffnen durch die Hülle keine Änderung melden (der Stand kommt ja gerade aus dem Speicher)
  let opening = false;
  const resetGate = setShortcutGate(() => shortcutsEnabled(active, host.isActive()));
  const stopWatch = watchProjectChanges(useEditor, () => {
    if (!opening) host.onChange();
  });
  const suite: SuiteBridge = {
    openProjects: () => host.openProjects?.(),
    newProject: (project) => host.requestNewProject(undefined, project),
    logoUrl,
  };
  // Styles von Rigsprite gelten nur unterhalb dieser Klasse (app.css)
  root.classList.add('area-rigsprite');
  const reactRoot = createRoot(root);
  reactRoot.render(<AppView suite={suite} />);

  return {
    open(project) {
      opening = true;
      try {
        useEditor.getState().loadProject(project); // neue Sitzung: Undo-Verlauf je Projekt
      } finally {
        opening = false;
      }
    },
    snapshot: () => useEditor.getState().project,
    thumbnail: () => thumbnailOf(captureViewport()),
    flush() {
      // Ein offenes Ziehen abschließen, damit der Stand vollständig gesichert wird
      const s = useEditor.getState();
      if (s.transaction) s.commitTransaction();
      host.onChange();
    },
    setActive(on) {
      active = on;
      if (!on) {
        const s = useEditor.getState();
        s.setSpaceHeld(false); // losgelassene Leertaste käme sonst nicht mehr an
        if (s.playing) s.setPlaying(false);
      }
    },
    destroy() {
      active = false;
      stopWatch();
      resetGate();
      reactRoot.unmount();
    },
  };
}

export const rigspriteArea: Area<Project> & { marker: string } = {
  kind: 'rigsprite',
  title: 'Rigsprite',
  marker: AREA_MARKER,
  mount: mountRigsprite,
};
