// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ map: new Map<string, unknown>(), failSet: false }));
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.map.get(k),
  set: async (k: string, v: unknown) => {
    if (db.failSet) throw new Error('quota');
    db.map.set(k, v);
  },
}));

import { createProject, serializeProject } from '../core/project';
import { AUTOSAVE_KEY, downloadProject, openProjectFile, restoreAutosave, startAutosave } from './persistence';
import { polyfillBlobText } from '../test/polyfills';
import { useEditor } from './store';

polyfillBlobText();

beforeEach(() => {
  db.map.clear();
  db.failSet = false;
  useEditor.getState().loadProject(createProject('humanoid'));
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('autosave', () => {
  it('writes after debounce', async () => {
    const stop = startAutosave(useEditor, 1000);
    useEditor.getState().setSettings({ pixelArt: true });
    await vi.advanceTimersByTimeAsync(999);
    expect(db.map.has(AUTOSAVE_KEY)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(db.map.get(AUTOSAVE_KEY)).toBe(serializeProject(useEditor.getState().project));
    stop();
  });

  it('ignores non-project changes and stops after unsubscribe', async () => {
    const stop = startAutosave(useEditor, 1000);
    useEditor.getState().setFrame(0);
    useEditor.getState().setMode('animate');
    await vi.advanceTimersByTimeAsync(2000);
    expect(db.map.has(AUTOSAVE_KEY)).toBe(false);
    stop();
    useEditor.getState().setSettings({ pixelArt: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(db.map.has(AUTOSAVE_KEY)).toBe(false);
  });

  it('flushes a pending save on pagehide', async () => {
    const stop = startAutosave(useEditor, 1000);
    useEditor.getState().setSettings({ pixelArt: true });
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(db.map.has(AUTOSAVE_KEY)).toBe(true);
    stop();
  });

  it('logs write errors instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.failSet = true;
    const stop = startAutosave(useEditor, 10);
    useEditor.getState().setSettings({ pixelArt: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(warn).toHaveBeenCalled();
    stop();
  });
});

describe('restoreAutosave', () => {
  it('loads saved project', async () => {
    db.map.set(AUTOSAVE_KEY, serializeProject({ ...createProject('humanoid'), name: 'Ritter' }));
    await expect(restoreAutosave()).resolves.toBe(true);
    expect(useEditor.getState().project.name).toBe('Ritter');
  });

  it('returns false for corrupt or missing content and keeps project', async () => {
    const before = useEditor.getState().project;
    await expect(restoreAutosave()).resolves.toBe(false);
    db.map.set(AUTOSAVE_KEY, '{');
    await expect(restoreAutosave()).resolves.toBe(false);
    db.map.set(AUTOSAVE_KEY, 42);
    await expect(restoreAutosave()).resolves.toBe(false);
    expect(useEditor.getState().project).toBe(before);
  });
});

describe('openProjectFile', () => {
  beforeEach(() => {
    vi.useRealTimers(); // jsdom FileReader needs real timers
  });

  it('with broken file keeps project', async () => {
    const before = useEditor.getState().project;
    const err = await openProjectFile(new File(['{'], 'x.json'));
    expect(err).toBe('Die Datei ist kein gültiges JSON.');
    expect(useEditor.getState().project).toBe(before);
  });

  it('loads a valid file', async () => {
    const text = serializeProject({ ...createProject('humanoid'), name: 'Zwerg' });
    await expect(openProjectFile(new File([text], 'z.rigsprite.json'))).resolves.toBeNull();
    expect(useEditor.getState().project.name).toBe('Zwerg');
  });
});

describe('downloadProject', () => {
  it('downloads the serialized project as <name>.rigsprite.json', async () => {
    const project = { ...createProject('humanoid'), name: 'Zwerg' };
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    downloadProject(project);
    expect(name).toBe('Zwerg.rigsprite.json');
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(blob.size).toBe(new Blob([serializeProject(project)]).size);
  });
});
