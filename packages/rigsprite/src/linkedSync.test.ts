// Abgleich verknüpfter Klexel-Bilder: syncLinkedSources (DOM-frei), carryLinkedUpdate und die Store-Aktionen
// linkSource / applyLinkedUpdate (Entscheidung: Aktualisieren erzeugt KEINEN Undo-Schritt).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceService } from '@suite/shared';
import { linkedSourceIds, syncLinkedSources } from './areaLogic';
import { carryLinkedUpdate, linkFramesAsImages, refreshLinkedImages, type SourceFrame, type SourceResult } from './core/linkedSprites';
import { createProject, type Project } from './core/project';
import { useEditor } from './state/store';

const frame = (frameId: number, name: string, px = 'A'): SourceFrame => ({
  frameId, name, width: 4, height: 4, dataUrl: `data:image/png;base64,${px}${frameId}`,
});
const src = (...frames: SourceFrame[]): SourceResult => ({ projectName: 'Held', frames });

function linkedProject(): Project {
  let p = createProject('humanoid');
  p = linkFramesAsImages(p, 'k1', src(frame(1, 'head'), frame(2, 'random'))).project;
  p = linkFramesAsImages(p, 'k2', src(frame(1, 'torso'))).project;
  return p;
}

/** Ziel wie im Bereich: ein veränderlicher Projekt-Stand */
function target(p: Project) {
  const t = { project: p, applied: 0 };
  return {
    t,
    target: {
      getProject: () => t.project,
      apply: (q: Project) => {
        t.project = q;
        t.applied++;
      },
    },
  };
}

const imageOf = (p: Project, projectId: string, frameId: number) =>
  Object.values(p.images).find((i) => i.source?.projectId === projectId && i.source.frameId === frameId)!;

describe('syncLinkedSources', () => {
  it('ohne Dienst: nichts passiert', async () => {
    const { t, target: tg } = target(linkedProject());
    const before = t.project;
    expect(await syncLinkedSources(undefined, tg)).toEqual({ updated: 0, missing: 0, added: 0, failed: 0 });
    expect(t.project).toBe(before);
  });

  it('liest jede Quelle genau einmal und übernimmt neue Pixel; Zuordnungen bleiben', async () => {
    const { t, target: tg } = target(linkedProject());
    const parts = t.project.parts;
    const read = vi.fn(async (id: string) =>
      id === 'k1' ? src(frame(1, 'head', 'B'), frame(2, 'random')) : src(frame(1, 'torso')),
    );
    const sum = await syncLinkedSources({ list: async () => [], read }, tg);
    expect(read.mock.calls.map((c) => c[0]).sort()).toEqual(['k1', 'k2']);
    expect(sum).toEqual({ updated: 1, missing: 0, added: 0, failed: 0 });
    expect(imageOf(t.project, 'k1', 1).dataUrl).toBe('data:image/png;base64,B1');
    expect(t.project.parts).toBe(parts);
    expect(t.applied).toBe(1); // k2 unverändert → kein Apply
  });

  it('null (Projekt gelöscht) markiert „Quelle fehlt" und behält das letzte Bild', async () => {
    const { t, target: tg } = target(linkedProject());
    const old = imageOf(t.project, 'k1', 1).dataUrl;
    const sum = await syncLinkedSources({ list: async () => [], read: async (id) => (id === 'k1' ? null : src(frame(1, 'torso'))) }, tg);
    expect(sum.missing).toBe(2);
    expect(imageOf(t.project, 'k1', 1).source?.missing).toBe(true);
    expect(imageOf(t.project, 'k1', 1).dataUrl).toBe(old);
    expect(imageOf(t.project, 'k2', 1).source?.missing).toBeUndefined();
  });

  it('Lesefehler: Projekt bleibt für diese Quelle unverändert, Fehler wird gemeldet, andere Quellen laufen weiter', async () => {
    const { t, target: tg } = target(linkedProject());
    const onError = vi.fn();
    const sum = await syncLinkedSources(
      {
        list: async () => [],
        read: async (id) => {
          if (id === 'k1') throw new Error('kaputt');
          return src(frame(1, 'torso', 'C'));
        },
      },
      tg,
      onError,
    );
    expect(sum).toMatchObject({ failed: 1, updated: 1 });
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'k1');
    expect(imageOf(t.project, 'k1', 1).dataUrl).toBe('data:image/png;base64,A1');
    expect(imageOf(t.project, 'k1', 1).source?.missing).toBeUndefined();
  });

  it('Nebenläufigkeit: das Ergebnis wird auf den Stand zum Zeitpunkt des Übernehmens angewandt', async () => {
    const { t, target: tg } = target(linkedProject());
    let release!: (r: SourceResult) => void;
    const sources: SourceService = {
      list: async () => [],
      read: (id) => (id === 'k1' ? new Promise((res) => (release = res)) : Promise.resolve(src(frame(1, 'torso')))),
    };
    const running = syncLinkedSources(sources, tg);
    // Bearbeitung während des Lesens
    t.project = { ...t.project, name: 'während', settings: { ...t.project.settings, mirror: true } };
    release(src(frame(1, 'head', 'Z'), frame(2, 'random')));
    await running;
    expect(t.project.name).toBe('während');
    expect(t.project.settings.mirror).toBe(true);
    expect(imageOf(t.project, 'k1', 1).dataUrl).toBe('data:image/png;base64,Z1');
  });

  it('verworfen, wenn veraltet (anderes Projekt geöffnet) oder die Verknüpfung inzwischen entfernt wurde', async () => {
    const { t, target: tg } = target(linkedProject());
    let stale = true;
    const sources: SourceService = { list: async () => [], read: async () => src(frame(1, 'head', 'Q'), frame(2, 'random'), frame(1, 'torso')) };
    await syncLinkedSources(sources, { ...tg, isStale: () => stale });
    expect(t.applied).toBe(0);
    stale = false;
    // k2-Bild entfernt: keine Wieder-Anlage
    const k2 = imageOf(t.project, 'k2', 1);
    const images = { ...t.project.images };
    delete images[k2.id];
    t.project = { ...t.project, images, parts: t.project.parts.filter((x) => x.imageId !== k2.id) };
    const read = vi.fn(sources.read);
    await syncLinkedSources({ ...sources, read }, tg);
    expect(read.mock.calls.map((c) => c[0])).toEqual(['k1']);
    expect(linkedSourceIds(t.project)).toEqual(['k1']);
  });
});

describe('carryLinkedUpdate', () => {
  it('überträgt Pixel, neue Bilder und neue Teile; behält eigene Namen und unverwandte Änderungen', () => {
    const before = linkedProject();
    const head = imageOf(before, 'k1', 1);
    const q = { ...before, name: 'alt', images: { ...before.images, [head.id]: { ...head, name: 'mein Kopf' } } };
    const after = refreshLinkedImages(before, 'k1', src(frame(1, 'head', 'N'), frame(2, 'random'), frame(3, 'upperArm_L'))).project;
    const carried = carryLinkedUpdate(q, before, after);
    expect(carried.name).toBe('alt');
    expect(carried.images[head.id]).toMatchObject({ name: 'mein Kopf', dataUrl: 'data:image/png;base64,N1' });
    const arm = imageOf(after, 'k1', 3);
    expect(carried.images[arm.id]).toBe(arm);
    expect(carried.parts.some((x) => x.imageId === arm.id && x.boneId === 'upperArm_L')).toBe(true);
  });

  it('ohne Bezug unverändert dasselbe Objekt', () => {
    const before = linkedProject();
    const q = createProject('humanoid');
    expect(carryLinkedUpdate(q, before, before)).toBe(q);
  });
});

describe('Store: linkSource / applyLinkedUpdate', () => {
  beforeEach(() => useEditor.getState().loadProject(createProject('humanoid')));
  const s = () => useEditor.getState();
  const past = () => useEditor.temporal.getState().pastStates.length;

  it('linkSource ist ein normaler Undo-Schritt', () => {
    const added = s().linkSource('k1', src(frame(1, 'head'), frame(2, 'random')));
    expect(added).toHaveLength(2);
    expect(past()).toBe(1);
    expect(s().project.parts.some((x) => x.boneId === 'head')).toBe(true);
    s().undo();
    expect(Object.keys(s().project.images)).toHaveLength(0);
    expect(s().linkSource('k1', src())).toEqual([]);
  });

  it('Aktualisieren erzeugt keinen Undo-Schritt; Undo danach nimmt es nicht zurück; spätere Bearbeitung bleibt rückgängig machbar', () => {
    s().linkSource('k1', src(frame(1, 'head'), frame(2, 'random')));
    s().setProjectName('Edit 1');
    expect(past()).toBe(2);
    const r = refreshLinkedImages(s().project, 'k1', src(frame(1, 'head', 'N'), frame(2, 'random'), frame(3, 'upperArm_L')));
    s().applyLinkedUpdate(r.project);
    expect(past()).toBe(2);
    expect(s().project).toBe(r.project);
    // Undo der letzten Bearbeitung: Name zurück, Aktualisierung bleibt
    s().undo();
    expect(s().project.name).not.toBe('Edit 1');
    expect(imageOf(s().project, 'k1', 1).dataUrl).toBe('data:image/png;base64,N1');
    expect(imageOf(s().project, 'k1', 3)).toBeDefined();
    // Redo ebenso
    s().redo();
    expect(s().project.name).toBe('Edit 1');
    expect(imageOf(s().project, 'k1', 1).dataUrl).toBe('data:image/png;base64,N1');
    // Bearbeitung nach dem Aktualisieren ist rückgängig machbar und behält die neuen Pixel
    s().setProjectName('Edit 2');
    expect(past()).toBe(3);
    s().undo();
    expect(s().project.name).toBe('Edit 1');
    expect(imageOf(s().project, 'k1', 1).dataUrl).toBe('data:image/png;base64,N1');
  });

  it('während einer offenen Transaktion: Abschluss und Abbruch behalten die Aktualisierung', () => {
    s().linkSource('k1', src(frame(1, 'head')));
    s().beginTransaction();
    s().setProjectName('gezogen');
    s().applyLinkedUpdate(refreshLinkedImages(s().project, 'k1', src(frame(1, 'head', 'T'))).project);
    expect(useEditor.temporal.getState().isTracking).toBe(false); // Pause der Transaktion bleibt
    s().cancelTransaction();
    expect(s().project.name).not.toBe('gezogen');
    expect(imageOf(s().project, 'k1', 1).dataUrl).toBe('data:image/png;base64,T1');
    expect(useEditor.temporal.getState().isTracking).toBe(true);
  });

  it('meldet die Änderung an Abonnenten (Autosave der Hülle)', () => {
    s().linkSource('k1', src(frame(1, 'head')));
    const listener = vi.fn();
    const stop = useEditor.subscribe((st, prev) => st.project !== prev.project && listener());
    s().applyLinkedUpdate(refreshLinkedImages(s().project, 'k1', src(frame(1, 'head', 'M'))).project);
    stop();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
