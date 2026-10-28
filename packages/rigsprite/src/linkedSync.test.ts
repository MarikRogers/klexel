// Abgleich verknüpfter Klexel-Bilder: syncLinkedSources (DOM-frei), carryLinkedUpdate und die Store-Aktionen
// linkSource / applyLinkedUpdate (Entscheidung: Aktualisieren erzeugt KEINEN Undo-Schritt).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceService } from '@suite/shared';
import { linkedSourceIds, syncLinkedSources } from './areaLogic';
import { carryLinkedUpdate, linkFramesAsImages, refreshLinkedImages, type SourceFrame, type SourceResult } from './core/linkedSprites';
import { createProject, parseProjectData, serializeProject, type Project } from './core/project';
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

  it('neue Bilder nicht in Zustände vor dem Verknüpfen (keine Waisen)', () => {
    const before = linkedProject();
    const after = refreshLinkedImages(before, 'k1', src(frame(1, 'head'), frame(2, 'random'), frame(3, 'upperArm_L'))).project;
    const unlinked = createProject('humanoid');
    expect(carryLinkedUpdate(unlinked, before, after)).toBe(unlinked);
    // nur k2 verknüpft: k1-Bilder und k1-Liste bleiben draußen
    const onlyK2 = linkFramesAsImages(createProject('humanoid'), 'k2', src(frame(1, 'torso'))).project;
    const c2 = carryLinkedUpdate(onlyK2, before, after);
    expect(linkedSourceIds(c2)).toEqual(['k2']);
    expect(c2.linkedFrames?.k1).toBeUndefined();
  });
});

describe('linkedFrames: entfernte Sprites kehren nicht zurück', () => {
  const removeImage = (p: Project, id: string): Project => {
    const images = { ...p.images };
    delete images[id];
    return { ...p, images, parts: p.parts.filter((x) => x.imageId !== id) };
  };
  const base = () => linkFramesAsImages(createProject('humanoid'), 'k1', src(frame(1, 'head'), frame(2, 'random'))).project;

  it('Verknüpfen merkt sich die angelegten Frames', () => {
    expect(base().linkedFrames).toEqual({ k1: [1, 2] });
  });

  it('entferntes Sprite: Sync legt es nicht wieder an; ein neuer Frame wird angelegt', () => {
    const p0 = base();
    const without = removeImage(p0, imageOf(p0, 'k1', 1).id);
    const r = refreshLinkedImages(without, 'k1', src(frame(1, 'head'), frame(2, 'random')));
    expect(r.added).toEqual([]);
    expect(r.project).toBe(without);
    const r2 = refreshLinkedImages(without, 'k1', src(frame(1, 'head'), frame(2, 'random'), frame(3, 'upperArm_L')));
    expect(r2.added).toHaveLength(1);
    expect(imageOf(r2.project, 'k1', 3)).toBeDefined();
    expect(imageOf(r2.project, 'k1', 1)).toBeUndefined();
    expect(r2.project.linkedFrames).toEqual({ k1: [1, 2, 3] });
  });

  it('syncLinkedSources legt ein entferntes Sprite nicht wieder an', async () => {
    const p0 = base();
    const { t, target: tg } = target(removeImage(p0, imageOf(p0, 'k1', 1).id));
    const before = t.project;
    await syncLinkedSources({ list: async () => [], read: async () => src(frame(1, 'head'), frame(2, 'random')) }, tg);
    expect(t.project).toBe(before);
  });

  it('explizites erneutes Verknüpfen legt fehlende Frames wieder an und setzt die Liste neu', () => {
    const p0 = base();
    const without = removeImage(p0, imageOf(p0, 'k1', 1).id);
    const r = linkFramesAsImages(without, 'k1', src(frame(1, 'head')));
    expect(r.added).toHaveLength(1);
    expect(imageOf(r.project, 'k1', 1).name).toBe('head');
    expect(r.project.linkedFrames).toEqual({ k1: [1, 2] }); // Frame 2 hat noch ein Bild
    const gone = removeImage(r.project, imageOf(r.project, 'k1', 2).id);
    expect(linkFramesAsImages(gone, 'k1', src(frame(1, 'head'))).project.linkedFrames).toEqual({ k1: [1] });
  });

  it('alte Projekte ohne Feld: der erste Sync merkt sich die vorhandenen Frames', () => {
    const old: Project = { ...base() };
    delete old.linkedFrames;
    const r = refreshLinkedImages(old, 'k1', src(frame(1, 'head'), frame(2, 'random')));
    expect(r.project.linkedFrames).toEqual({ k1: [1, 2] });
    expect(refreshLinkedImages(r.project, 'k1', src(frame(1, 'head'), frame(2, 'random'))).project).toBe(r.project);
  });

  it('Round-Trip über Datei; ungültige Einträge still verworfen; alte Datei ohne Feld bleibt ohne', () => {
    const raw = JSON.parse(serializeProject(base()));
    const back = parseProjectData(raw);
    expect(back.ok && back.project.linkedFrames).toEqual({ k1: [1, 2] });
    raw.linkedFrames = { k1: [1, 0, -2, 1.5, 'x', 2, 2], '': [1], k2: 'nein', k3: [], k4: [7] };
    const r = parseProjectData(raw);
    expect(r.ok && r.project.linkedFrames).toEqual({ k1: [1, 2], k4: [7] });
    raw.linkedFrames = 'kaputt';
    const r2 = parseProjectData(raw);
    expect(r2.ok && 'linkedFrames' in r2.project).toBe(false);
    delete raw.linkedFrames;
    const r3 = parseProjectData(raw);
    expect(r3.ok).toBe(true);
    expect(r3.ok && 'linkedFrames' in r3.project).toBe(false);
  });

  it('Store: entferntes Sprite bleibt nach Aktualisieren weg; Undo/Redo-Zustände tragen die Liste mit', () => {
    useEditor.getState().loadProject(createProject('humanoid'));
    const s = () => useEditor.getState();
    s().linkSource('k1', src(frame(1, 'head'), frame(2, 'random')));
    s().removeImage(imageOf(s().project, 'k1', 1).id);
    const r = refreshLinkedImages(s().project, 'k1', src(frame(1, 'head'), frame(2, 'random'), frame(3, 'x')));
    s().applyLinkedUpdate(r.project);
    expect(imageOf(s().project, 'k1', 1)).toBeUndefined();
    expect(imageOf(s().project, 'k1', 3)).toBeDefined();
    s().undo(); // Entfernen rückgängig: Bild 1 wieder da, Frame 3 bleibt, Liste vollständig
    expect(imageOf(s().project, 'k1', 1)).toBeDefined();
    expect(imageOf(s().project, 'k1', 3)).toBeDefined();
    expect(s().project.linkedFrames).toEqual({ k1: [1, 2, 3] });
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

  it('wirft das Übertragen in den Verlauf, bleibt alles unverändert und der Verlauf läuft weiter', () => {
    s().linkSource('k1', src(frame(1, 'head')));
    const good = s().project;
    // kaputter Verlaufseintrag: carryLinkedUpdate wirft daran
    const pastStates = useEditor.temporal.getState().pastStates;
    useEditor.temporal.setState({ pastStates: [{ project: { ...good, images: undefined as never } }, ...pastStates] });
    const next = refreshLinkedImages(good, 'k1', src(frame(1, 'head', 'X'))).project;
    expect(() => s().applyLinkedUpdate(next)).toThrow();
    expect(s().project).toBe(good);
    expect(useEditor.temporal.getState().isTracking).toBe(true);
    useEditor.temporal.setState({ pastStates });
    s().setProjectName('danach');
    expect(past()).toBe(2);
    s().undo();
    expect(s().project).toBe(good);
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
