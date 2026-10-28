// @vitest-environment jsdom
// Wechsel-Logik der Hülle mit Fake-Bereichen und Speicher im Arbeitsspeicher (ohne echte Editoren/IndexedDB).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Area, AreaDescriptor, AreaHost, ProjectKind } from '@suite/shared';
import { MemoryBackend, WorkspaceStore } from '@suite/shared';
import { startShell } from './shell';

interface P { kind: ProjectKind; v: number }

interface Fake {
  d: AreaDescriptor<P>;
  host?: AreaHost;
  /** #-Teil der Adresse beim Einhängen (ein Bereich liest einen Link beim Einhängen selbst) */
  hashAtMount?: string;
  followLink: ReturnType<typeof vi.fn<(hash: string) => void>>;
  /** Inhalt im „Editor" */
  content?: P;
  failLoad: boolean;
  opened: P[];
}

function fake(kind: ProjectKind, autosaveDelayMs?: number): Fake {
  const f: Fake = { failLoad: false, opened: [], followLink: vi.fn() } as unknown as Fake;
  const area: Area<P> = {
    kind, title: kind,
    mount(_root, host) {
      f.host = host;
      f.hashAtMount = location.hash;
      return {
        followLink: () => f.followLink(location.hash),
        open: p => { f.content = { ...p }; f.opened.push(p); },
        snapshot: () => ({ ...f.content! }),
        thumbnail: () => `data:${kind}`,
        flush: () => host.onChange(),
        setActive: () => undefined,
        destroy: () => undefined,
      };
    },
  };
  f.d = {
    kind, title: kind, autosaveDelayMs,
    load: vi.fn(async () => { if (f.failLoad) throw new Error('Chunk fehlt'); return area; }),
    blank: () => ({ kind, v: 0 }),
    decode: raw => (raw && typeof raw === 'object' && (raw as P).kind === kind ? (raw as P) : null),
    changeKey: p => JSON.stringify(p),
  };
  return f;
}

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

let app: HTMLElement;
let kv: MemoryBackend;
let store: WorkspaceStore;
let K: Fake, R: Fake;

beforeEach(() => {
  document.body.replaceChildren();
  app = document.createElement('div');
  app.id = 'app';
  document.body.append(app);
  kv = new MemoryBackend();
  store = new WorkspaceStore(kv);
  K = fake('klexel');
  R = fake('rigsprite', 30);
});
afterEach(() => { vi.useRealTimers(); });

const descriptors = () => [K.d, R.d] as unknown as AreaDescriptor<unknown>[];
const container = (kind: string) => document.querySelector<HTMLElement>(`[data-area="${kind}"]`)!;

describe('startShell: Start', () => {
  it('leeres Workspace: leeres Projekt der ersten Art, nur dieser Bereich wird geladen', async () => {
    await startShell(app, descriptors(), { backend: kv });
    const list = await store.list();
    expect(list.map(m => m.kind)).toEqual(['klexel']);
    expect(K.d.load).toHaveBeenCalled();
    expect(R.d.load).not.toHaveBeenCalled();
    expect(container('klexel').hidden).toBe(false);
    expect(container('rigsprite').hidden).toBe(true);
  });

  it('zuletzt geöffnetes Rigsprite-Projekt: nur Rigsprite wird geladen und eingehängt', async () => {
    await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv });
    expect(R.opened).toEqual([{ kind: 'rigsprite', v: 2 }]);
    expect(R.d.load).toHaveBeenCalled();
    expect(K.d.load).not.toHaveBeenCalled();
    expect(app.hidden).toBe(true);
    expect(container('rigsprite').hidden).toBe(false);
  });

  it('Bereich des zuletzt geöffneten Projekts nicht ladbar: weicht auf ein Projekt einer anderen Art aus', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(r.id);
    R.failLoad = true;
    await expect(startShell(app, descriptors(), { backend: kv })).resolves.toBeDefined();
    expect(K.opened).toEqual([{ kind: 'klexel', v: 1 }]);
    expect(await store.lastOpened()).toBe(k.id);
    expect(container('rigsprite').hidden).toBe(true);
  });
});

describe('startShell: Wechsel zwischen Arten', () => {
  it('sichert vor dem Wechsel unter der alten id und danach unter der neuen (je Art)', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    K.content = { kind: 'klexel', v: 10 }; // ungesicherte Änderung in Klexel
    await shell.switchProject(r.id);
    expect(await store.load(k.id)).toEqual({ kind: 'klexel', v: 10 });
    expect(container('klexel').hidden).toBe(true);
    expect(container('rigsprite').hidden).toBe(false);
    expect(R.host!.isActive()).toBe(true);
    expect(K.host!.isActive()).toBe(false);

    R.content = { kind: 'rigsprite', v: 20 };
    R.host!.onChange();
    K.host!.onChange(); // Meldung des verdeckten Bereichs: ignoriert
    await tick(80);
    expect(await store.load(r.id)).toEqual({ kind: 'rigsprite', v: 20 });
    expect(await store.load(k.id)).toEqual({ kind: 'klexel', v: 10 });

    await shell.switchProject(k.id);
    expect(K.opened.at(-1)).toEqual({ kind: 'klexel', v: 10 });
    expect(container('klexel').inert).toBe(false);
    expect(container('rigsprite').inert).toBe(true);
  });

  it('Bereich nicht ladbar: Wechsel scheitert, das bisherige Projekt bleibt offen und wird weiter gesichert', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    R.failLoad = true;
    await expect(shell.switchProject(r.id)).rejects.toThrow();
    expect(container('klexel').hidden).toBe(false);
    expect(container('klexel').inert).toBe(false);
    expect(container('rigsprite').hidden).toBe(true);
    expect(K.host!.isActive()).toBe(true);
    K.content = { kind: 'klexel', v: 5 };
    K.host!.onChange();
    await tick(80);
    expect(await store.load(k.id)).toEqual({ kind: 'klexel', v: 5 });
    expect(await store.load(r.id)).toEqual({ kind: 'rigsprite', v: 2 });
    expect(await store.lastOpened()).toBe(k.id);
  });

  it('Autosave-Wartezeit je Art (Beschreibung autosaveDelayMs, sonst Standard 50 ms)', async () => {
    R.d.autosaveDelayMs = 500;
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv });
    vi.useFakeTimers();
    R.content = { kind: 'rigsprite', v: 3 };
    R.host!.onChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(await store.load(r.id)).toEqual({ kind: 'rigsprite', v: 2 });
    await vi.advanceTimersByTimeAsync(400);
    expect(await store.load(r.id)).toEqual({ kind: 'rigsprite', v: 3 });
  });

  it('neues Projekt mit fertigem Inhalt (requestNewProject mit content)', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await store.setLastOpened(k.id);
    await startShell(app, descriptors(), { backend: kv });
    await startNewViaHost(K.host!, { kind: 'klexel', v: 7 });
    const metas = await store.list();
    expect(metas).toHaveLength(2);
    const created = metas.find(m => m.id !== k.id)!;
    expect(await store.load(created.id)).toEqual({ kind: 'klexel', v: 7 });
    expect(await store.lastOpened()).toBe(created.id);
  });
});

describe('startShell: Bereichswechsel', () => {
  it('öffnet das zuletzt geänderte Projekt des anderen Bereichs und sichert vorher das offene', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await tick(2);
    const rNew = await store.create('rigsprite', 'R neu', { kind: 'rigsprite', v: 2 });
    await tick(2);
    const rOld = await store.create('rigsprite', 'R alt', { kind: 'rigsprite', v: 3 });
    // R neu wird danach geändert und ist damit das zuletzt geänderte Rigsprite-Projekt
    await tick(2);
    await store.save(rNew.id, { kind: 'rigsprite', v: 22 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    K.content = { kind: 'klexel', v: 9 };
    await shell.switchArea('rigsprite');
    expect(await store.load(k.id)).toEqual({ kind: 'klexel', v: 9 });
    expect(R.opened.at(-1)).toEqual({ kind: 'rigsprite', v: 22 });
    expect(await store.lastOpened()).toBe(rNew.id);
    expect(container('rigsprite').hidden).toBe(false);
    expect(container('klexel').hidden).toBe(true);
    expect((await store.list()).map(m => m.id).sort()).toEqual([k.id, rNew.id, rOld.id].sort());

    // zurück: das Klexel-Projekt
    await shell.switchArea('klexel');
    expect(K.opened.at(-1)).toEqual({ kind: 'klexel', v: 9 });
    expect(await store.lastOpened()).toBe(k.id);
  });

  it('ohne Projekt der Art: legt ein leeres an und öffnet es', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    K.content = { kind: 'klexel', v: 4 };
    await shell.switchArea('rigsprite');
    const metas = await store.list();
    expect(metas.map(m => m.kind).sort()).toEqual(['klexel', 'rigsprite']);
    const r = metas.find(m => m.kind === 'rigsprite')!;
    expect(await store.lastOpened()).toBe(r.id);
    expect(R.opened).toEqual([{ kind: 'rigsprite', v: 0 }]);
    expect(await store.load(k.id)).toEqual({ kind: 'klexel', v: 4 });
    expect(container('rigsprite').hidden).toBe(false);
  });

  it('neuestes Projekt der Art unlesbar: nimmt das nächste lesbare', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await tick(2);
    const rOk = await store.create('rigsprite', 'R ok', { kind: 'rigsprite', v: 2 });
    await tick(2);
    const rBad = await store.create('rigsprite', 'R kaputt', { kind: 'klexel', v: 99 }); // falsche Art = unlesbar
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    expect((await store.list()).find(m => m.kind === 'rigsprite')!.id).toBe(rBad.id);
    await shell.switchArea('rigsprite');
    expect(R.opened).toEqual([{ kind: 'rigsprite', v: 2 }]);
    expect(await store.lastOpened()).toBe(rOk.id);
    expect(container('rigsprite').hidden).toBe(false);
    expect((await store.list())).toHaveLength(3);
  });

  it('kein Projekt der Art lesbar: legt ein leeres an', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await store.create('rigsprite', 'R kaputt', { kind: 'klexel', v: 99 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    await shell.switchArea('rigsprite');
    expect(R.opened).toEqual([{ kind: 'rigsprite', v: 0 }]);
    const metas = await store.list();
    expect(metas).toHaveLength(3);
    expect(await store.lastOpened()).toBe(metas.find(m => m.kind === 'rigsprite' && m.name !== 'R kaputt')!.id);
  });

  it('gleicher Bereich: nichts passiert', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    await shell.switchArea('klexel');
    expect(K.opened).toHaveLength(1);
    expect(await store.list()).toHaveLength(1);
  });

  it('Sichern scheitert: kein Wechsel', async () => {
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    K.content = { kind: 'klexel', v: 5 };
    const spy = vi.spyOn(WorkspaceStore.prototype, 'save').mockRejectedValueOnce(new Error('voll'));
    await expect(shell.switchArea('rigsprite')).rejects.toThrow();
    spy.mockRestore();
    expect(R.d.load).not.toHaveBeenCalled();
    expect(container('klexel').hidden).toBe(false);
  });
});

describe('startShell: Bild-Quellen (host.sources)', () => {
  // Fake-„Klexel": v = Pixelwert; zwei Frames, der zweite unbenannt
  const withFrames = (f: Fake) => {
    f.d.framesOf = p => (p.v < 0 ? null : {
      name: 'intern',
      frames: [
        { frameId: 1, name: 'head', width: 2, height: 1, pixels: new Uint32Array([p.v, 0]) },
        { frameId: 4, name: 'Frame 2', width: 1, height: 1, pixels: new Uint32Array([7]) },
      ],
    });
  };
  const toDataUrl = (w: number, h: number, px: Uint32Array) => `png:${w}x${h}:${[...px].join(',')}`;

  it('ohne Bereich mit framesOf gibt es keinen Dienst', async () => {
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 1 });
    await store.setLastOpened(r.id);
    await startShell(app, [R.d] as unknown as AreaDescriptor<unknown>[], { backend: kv, toDataUrl });
    expect(R.host!.sources).toBeUndefined();
  });

  it('list: nur Projekte der Arten mit Frames; read: Frames als Bilder mit Projektname', async () => {
    withFrames(K);
    const k = await store.create('klexel', 'Figur', { kind: 'klexel', v: 9 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 1 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv, toDataUrl });
    const src = R.host!.sources!;
    expect((await src.list()).map(m => m.id)).toEqual([k.id]);
    expect(await src.read(k.id)).toEqual({
      projectName: 'Figur',
      frames: [
        { frameId: 1, name: 'head', width: 2, height: 1, dataUrl: 'png:2x1:9,0' },
        { frameId: 4, name: 'Frame 2', width: 1, height: 1, dataUrl: 'png:1x1:7' },
      ],
    });
  });

  it('read: gelöscht, unbekannt, falsche Art oder unlesbar → null', async () => {
    withFrames(K);
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const bad = await store.create('klexel', 'kaputt', { kind: 'klexel', v: -1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 1 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv, toDataUrl });
    const src = R.host!.sources!;
    await store.remove(k.id);
    expect(await src.read(k.id)).toBeNull();
    expect(await src.read('gibt-es-nicht')).toBeNull();
    expect(await src.read(r.id)).toBeNull();
    expect(await src.read(bad.id)).toBeNull();
  });

  it('read des gerade offenen Projekts sichert vorher (ungesicherte Änderungen zählen mit)', async () => {
    withFrames(K);
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await store.setLastOpened(k.id);
    await startShell(app, descriptors(), { backend: kv, toDataUrl });
    K.content = { kind: 'klexel', v: 42 }; // noch nicht gesichert
    const res = await K.host!.sources!.read(k.id);
    expect(res!.frames[0].dataUrl).toBe('png:2x1:42,0');
    expect(await store.load(k.id)).toEqual({ kind: 'klexel', v: 42 });
  });

  it('nach dem Wechsel zu Rigsprite liest read den beim Wechsel gesicherten Klexel-Stand', async () => {
    withFrames(K);
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 1 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv, toDataUrl });
    K.content = { kind: 'klexel', v: 5 };
    await shell.switchProject(r.id);
    expect((await R.host!.sources!.read(k.id))!.frames[0].dataUrl).toBe('png:2x1:5,0');
  });
});

async function startNewViaHost(host: AreaHost, content: unknown): Promise<void> {
  host.requestNewProject(undefined, content);
  await tick(100);
}

describe('startShell: Rückgabe an Klexel (host.returnToKlexel)', () => {
  const toDataUrl = (w: number, h: number, px: Uint32Array) => `png:${w}x${h}:${px[0]}`;
  const req = (name = 'walk', animationId = 'a1') => ({
    name, width: 2, height: 1, fps: 10, origin: { animationId },
    frames: [{ name: '', pixels: Uint32Array.of(7, 8) }, { name: '', pixels: Uint32Array.of(9, 9) }],
  });
  const withFromFrames = () => {
    K.d.fromFrames = vi.fn(input => {
      if (input.width > 128) throw new RangeError('zu groß');
      return { kind: 'klexel' as const, v: input.frames.length };
    });
  };

  it('fehlt ohne einen Bereich mit fromFrames', async () => {
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 1 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv, toDataUrl });
    expect(R.host!.returnToKlexel).toBeUndefined();
    expect(R.host!.openProject).toBeTypeOf('function');
  });

  it('legt bei jedem Aufruf ein neues Projekt an (Herkunft, eindeutiger Name), ohne zu wechseln', async () => {
    withFromFrames();
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 1 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv, toDataUrl });
    R.content = { kind: 'rigsprite', v: 5 }; // ungesicherte Änderung bleibt im Editor
    const host = R.host!;
    // gleichzeitig: beide eingereiht, zwei verschiedene Projekte
    const [a, b] = await Promise.all([host.returnToKlexel!(req()), host.returnToKlexel!(req())]);
    expect(a.projectId).not.toBe(b.projectId);
    expect(a.name).toBe('walk (aus rigsprite)');
    expect(b.name).toBe('walk (aus rigsprite) 2');
    const list = await store.list();
    const ma = list.find(m => m.id === a.projectId)!;
    expect(ma.kind).toBe('klexel');
    expect(ma.origin).toEqual({ rigProjectId: r.id, animationId: 'a1' });
    expect(ma.thumbnail).toBe('png:2x1:7');
    expect(await store.load(a.projectId)).toEqual({ kind: 'klexel', v: 2 });
    expect(K.d.fromFrames).toHaveBeenCalledWith(expect.objectContaining({ name: 'walk', fps: 10 }));
    // Rigsprite bleibt offen und unverändert; Klexel wurde nicht geladen
    expect(K.d.load).not.toHaveBeenCalled();
    expect(container('rigsprite').hidden).toBe(false);
    expect(host.isActive()).toBe(true);
    expect(R.content).toEqual({ kind: 'rigsprite', v: 5 });
    expect(await store.load(r.id)).toEqual({ kind: 'rigsprite', v: 1 });
    expect(await store.lastOpened()).toBe(r.id);
    // erneute Rückgabe überschreibt nichts
    const c = await host.returnToKlexel!(req());
    expect(new Set([a.projectId, b.projectId, c.projectId]).size).toBe(3);
    expect(await store.load(a.projectId)).toEqual({ kind: 'klexel', v: 2 });
  });

  it('Fehler: lehnt mit deutscher Meldung ab und legt nichts an', async () => {
    withFromFrames();
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 1 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv, toDataUrl });
    await expect(R.host!.returnToKlexel!({ ...req(), width: 200 })).rejects.toThrow(/konnte nicht angelegt werden/);
    expect((await store.list()).map(m => m.id)).toEqual([r.id]);
    // die Warteschlange läuft danach weiter
    await expect(R.host!.returnToKlexel!(req())).resolves.toMatchObject({ name: 'walk (aus rigsprite)' });
  });

  it('openProject öffnet das zurückgegebene Projekt über den Wechsel', async () => {
    withFromFrames();
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 1 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv, toDataUrl });
    const { projectId } = await R.host!.returnToKlexel!(req());
    await R.host!.openProject!(projectId);
    expect(K.opened).toEqual([{ kind: 'klexel', v: 2 }]);
    expect(container('klexel').hidden).toBe(false);
    expect(await store.lastOpened()).toBe(projectId);
  });
});

describe('startShell: geteilter Link in der Adresse (handlesHash)', () => {
  // Fake-„Klexel" erkennt #i=… wie der echte Bereich (Prüfung nur des Präfixes)
  const withLinks = () => { K.d.handlesHash = h => /^#?i=/.test(h); };
  const setHash = (h: string) => history.replaceState(null, '', h ? `#${h}` : location.pathname);
  const changeHash = async (h: string) => {
    setHash(h);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await tick(20);
  };
  afterEach(() => setHash(''));

  it('Start mit Link, zuletzt offen war Rigsprite: Klexel wird statt Rigsprite eingehängt und sieht den Link', async () => {
    withLinks();
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(r.id);
    setHash('i=abc');
    await startShell(app, descriptors(), { backend: kv });
    expect(K.opened).toEqual([{ kind: 'klexel', v: 1 }]);
    expect(K.hashAtMount).toBe('#i=abc');
    expect(R.d.load).not.toHaveBeenCalled();
    expect(container('klexel').hidden).toBe(false);
    expect(await store.lastOpened()).toBe(k.id);
    expect(location.hash).toBe('#i=abc'); // die Hülle lässt den Link stehen
    expect(K.followLink).not.toHaveBeenCalled(); // frisch eingehängt: liest selbst
  });

  it('Start mit Link ohne Klexel-Projekt: legt ein leeres Klexel-Projekt an, Rigsprite wird nicht geladen', async () => {
    withLinks();
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(r.id);
    setHash('i=abc');
    await startShell(app, descriptors(), { backend: kv });
    expect(K.opened).toEqual([{ kind: 'klexel', v: 0 }]);
    expect(K.hashAtMount).toBe('#i=abc');
    expect(R.d.load).not.toHaveBeenCalled();
    expect((await store.list()).map(m => m.kind).sort()).toEqual(['klexel', 'rigsprite']);
  });

  it('Link bei sichtbarem Rigsprite, Klexel noch nie eingehängt: sichert, wechselt und hängt Klexel mit dem Link ein', async () => {
    withLinks();
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(r.id);
    await startShell(app, descriptors(), { backend: kv });
    R.content = { kind: 'rigsprite', v: 7 }; // ungesichert
    await changeHash('i=xyz');
    expect(await store.load(r.id)).toEqual({ kind: 'rigsprite', v: 7 });
    expect(K.opened).toEqual([{ kind: 'klexel', v: 1 }]);
    expect(K.hashAtMount).toBe('#i=xyz');
    expect(K.followLink).not.toHaveBeenCalled();
    expect(container('klexel').hidden).toBe(false);
    expect(container('rigsprite').hidden).toBe(true);
    expect(K.host!.isActive()).toBe(true);
    expect(await store.lastOpened()).toBe(k.id);
  });

  it('Link bei sichtbarem Rigsprite, Klexel schon eingehängt (verdeckt): wechselt und ruft followLink einmal', async () => {
    withLinks();
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    await shell.switchArea('rigsprite');
    expect(container('klexel').hidden).toBe(true);
    await changeHash('i=xyz');
    expect(container('klexel').hidden).toBe(false);
    expect(K.followLink).toHaveBeenCalledTimes(1);
    expect(K.followLink).toHaveBeenCalledWith('#i=xyz');
    expect(K.host!.isActive()).toBe(true); // erst nach dem Wechsel gerufen: bedienbar
  });

  it('Wechsel zum Link scheitert (Speichern wirft): kein Dialog im verdeckten Klexel, Rigsprite bleibt bedienbar', async () => {
    withLinks();
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(k.id);
    const shell = await startShell(app, descriptors(), { backend: kv });
    await shell.switchArea('rigsprite');
    // Wie Klexel: eigener hashchange nur, wenn die Hülle den Bereich freigibt (host.isActive)
    const onHash = () => {
      if (!K.host!.isActive()) return;
      const dlg = document.createElement('dialog');
      dlg.setAttribute('open', '');
      container('klexel').append(dlg);
    };
    window.addEventListener('hashchange', onHash);
    R.content = { kind: 'rigsprite', v: 9 }; // ungesichert → Wechsel muss sichern
    const spy = vi.spyOn(WorkspaceStore.prototype, 'save').mockRejectedValue(new Error('voll'));
    try {
      await changeHash('i=xyz');
    } finally { spy.mockRestore(); window.removeEventListener('hashchange', onHash); }
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(K.followLink).not.toHaveBeenCalled();
    expect(container('klexel').hidden).toBe(true);
    expect(container('rigsprite').hidden).toBe(false);
    expect(container('rigsprite').inert).toBe(false);
    expect(R.host!.isActive()).toBe(true);
    expect(K.host!.isActive()).toBe(false);
    const toast = document.querySelector('.toast')!;
    expect(toast.textContent).toBe('Speichern fehlgeschlagen – Projekt nicht gewechselt');
    expect(toast.parentElement).toBe(document.body);
    expect(await store.lastOpened()).toBe(r.id);
  });

  it('Link bei sichtbarem Klexel: die Hülle tut nichts (Klexel behandelt seinen hashchange selbst)', async () => {
    withLinks();
    const k = await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    await store.setLastOpened(k.id);
    await startShell(app, descriptors(), { backend: kv });
    await changeHash('i=xyz');
    expect(K.followLink).not.toHaveBeenCalled();
    expect(K.opened).toHaveLength(1);
    expect(await store.list()).toHaveLength(1);
  });

  it('anderer #-Teil: kein Wechsel', async () => {
    withLinks();
    await store.create('klexel', 'K', { kind: 'klexel', v: 1 });
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(r.id);
    setHash('irgendwas');
    await startShell(app, descriptors(), { backend: kv });
    expect(K.d.load).not.toHaveBeenCalled();
    await changeHash('x=1');
    expect(K.d.load).not.toHaveBeenCalled();
    expect(container('rigsprite').hidden).toBe(false);
    expect(await store.lastOpened()).toBe(r.id);
  });

  it('Build ohne Klexel: ein Link wird still ignoriert', async () => {
    const r = await store.create('rigsprite', 'R', { kind: 'rigsprite', v: 2 });
    await store.setLastOpened(r.id);
    setHash('i=abc');
    await startShell(app, [R.d] as unknown as AreaDescriptor<unknown>[], { backend: kv });
    await changeHash('i=def');
    expect(R.opened).toEqual([{ kind: 'rigsprite', v: 2 }]);
    expect(await store.list()).toHaveLength(1);
  });
});
