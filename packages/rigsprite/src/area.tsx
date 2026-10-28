// Einhängbarer Bereich Rigsprite für die Suite (samt React und Styles). Wird nur über rigspriteDescriptor.load()
// dynamisch geladen, damit Editor und Styles ein eigener Chunk bleiben (und in Builds ohne Rigsprite ganz fehlen).
import './ui/app.css';
import { createRoot } from 'react-dom/client';
import type { Area, AreaHandle, AreaHost } from '@suite/shared';
import { showToast } from '@suite/shared/ui';
import type { Project } from './core/project';
import { shortcutsEnabled, syncLinkedSources, watchProjectChanges, type LinkedSyncSummary } from './areaLogic';
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
  let destroyed = false;
  // Beim Öffnen durch die Hülle keine Änderung melden (der Stand kommt ja gerade aus dem Speicher)
  let opening = false;
  const resetGate = setShortcutGate(() => shortcutsEnabled(active, host.isActive()));
  const stopWatch = watchProjectChanges(useEditor, () => {
    if (!opening) host.onChange();
  });

  // Verknüpfte Klexel-Bilder abgleichen: beim Öffnen, beim Wieder-Sichtbarwerden und über „Aktualisieren".
  // Jedes open() beginnt eine neue Sitzung; Ergebnisse einer älteren werden verworfen. Ein laufender Abgleich
  // derselben Sitzung wird mitbenutzt statt doppelt gelesen (open und setActive(true) folgen direkt aufeinander).
  let session = 0;
  let running: { session: number; promise: Promise<LinkedSyncSummary> } | null = null;
  const syncSources = (auto: boolean): Promise<LinkedSyncSummary> => {
    if (running && running.session === session) return running.promise;
    const mine = session;
    const promise: Promise<LinkedSyncSummary> = syncLinkedSources(
      host.sources,
      {
        getProject: () => useEditor.getState().project,
        apply: (p) => useEditor.getState().applyLinkedUpdate(p),
        isStale: () => destroyed || mine !== session,
      },
      (err, id) => console.error(`Klexel-Quelle ${id} konnte nicht gelesen werden`, err),
    )
      .then((sum) => {
        // Automatischer Abgleich: Fehler nur kurz melden (der Knopf „Aktualisieren" zeigt sie selbst an)
        if (auto && sum.failed > 0 && !destroyed) showToast('Klexel-Bilder konnten nicht aktualisiert werden', 3000);
        return sum;
      })
      .finally(() => {
        if (running?.promise === promise) running = null;
      });
    running = { session: mine, promise };
    return promise;
  };

  const suite: SuiteBridge = {
    openProjects: () => host.openProjects?.(),
    newProject: (project) => host.requestNewProject(undefined, project),
    logoUrl,
    ...(host.sources ? { sources: host.sources, syncSources: () => syncSources(false) } : {}),
    ...(host.returnToKlexel ? { returnToKlexel: host.returnToKlexel.bind(host) } : {}),
    ...(host.openProject ? { openProject: host.openProject.bind(host) } : {}),
  };
  // Styles von Rigsprite gelten nur unterhalb dieser Klasse (app.css)
  root.classList.add('area-rigsprite');
  const reactRoot = createRoot(root);
  reactRoot.render(<AppView suite={suite} />);

  return {
    open(project) {
      opening = true;
      session++;
      try {
        useEditor.getState().loadProject(project); // neue Sitzung: Undo-Verlauf je Projekt
      } finally {
        opening = false;
      }
      void syncSources(true);
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
      // (Wieder) bedienbar: Klexel kann sich inzwischen geändert haben oder gelöscht worden sein. Die Hülle meldet
      // das auch nach jeder eigenen Aktion (z. B. Löschen in der Projektliste), während Rigsprite sichtbar war.
      // Ein Abgleich, der schon läuft (z. B. von open), wird mitbenutzt.
      if (on) void syncSources(true);
      if (!on) {
        const s = useEditor.getState();
        s.setSpaceHeld(false); // losgelassene Leertaste käme sonst nicht mehr an
        if (s.playing) s.setPlaying(false);
      }
    },
    destroy() {
      active = false;
      destroyed = true;
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
