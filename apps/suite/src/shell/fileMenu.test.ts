// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { MemoryBackend, WorkspaceStore } from '@suite/shared';
import { rigspriteDescriptor, type Project } from '@suite/rigsprite';
import { createFileActions, sanitizeFileName } from './fileMenu';

describe('sanitizeFileName', () => {
  it('entfernt unzulässige Zeichen', () => {
    expect(sanitizeFileName('a\\b/c:d*e?"f<g>h|i')).toBe('abcdefghi');
  });
  it('fängt reservierte Windows-Namen ab', () => {
    for (const n of ['CON', 'nul', 'COM1', 'lpt9', 'aux.txt']) expect(sanitizeFileName(n)).toBe('_' + n);
    expect(sanitizeFileName('Console')).toBe('Console');
  });
  it('leer ergibt Projekt', () => {
    expect(sanitizeFileName('  ...')).toBe('Projekt');
    expect(sanitizeFileName('')).toBe('Projekt');
  });
});

describe('importFile: eigenständige Rigsprite-Projektdatei', () => {
  const project = (extra: object = {}) => ({
    version: 1, name: '  Held  ', rigTemplateId: 'humanoid', rig: { bones: [] }, images: {}, parts: [], animations: [], settings: {}, ...extra,
  });
  // jsdom kennt File.text() nicht
  const file = (v: unknown) => ({ text: async () => (typeof v === 'string' ? v : JSON.stringify(v)) }) as unknown as File;
  const toast = () => document.querySelector('.toast')?.textContent;
  const setup = (withRigsprite: boolean) => {
    const store = new WorkspaceStore(new MemoryBackend());
    const actions = createFileActions({
      store,
      prepare: async () => undefined,
      isKnownKind: k => k === 'klexel' || (withRigsprite && k === 'rigsprite'),
      validatePayload: (k, p) => k !== 'rigsprite' || (typeof p === 'object' && p !== null && (p as { version?: number }).version === 1),
    });
    return { store, actions };
  };

  it('fügt es als neues Rigsprite-Projekt hinzu, Name bereinigt', async () => {
    const { store, actions } = setup(true);
    expect(await actions.importFile(file(project()))).toBe(1);
    const list = await store.list();
    expect(list.map(m => [m.kind, m.name])).toEqual([['rigsprite', 'Held']]);
    expect(await store.lastOpened()).toBeNull();
    expect(toast()).toBe('Rigsprite-Projekt hinzugefügt');
  });

  it('erkennt am Inhalt, nicht am Dateinamen', async () => {
    const { store, actions } = setup(true);
    expect(await actions.importFile(file(project({ name: '' })))).toBe(1);
    expect((await store.list())[0].name).toBe('Unbenannt');
  });

  it('ohne Rigsprite-Bereich: speichert nichts und erklärt es', async () => {
    const { store, actions } = setup(false);
    expect(await actions.importFile(file(project()))).toBe(0);
    expect(await store.list()).toEqual([]);
    expect(toast()).toBe('Diese Datei ist ein Rigsprite-Projekt, aber Rigsprite ist in dieser Version nicht enthalten.');
  });

  it('Projekt einer neueren Version: eigene Meldung, nichts gespeichert', async () => {
    const { store, actions } = setup(true);
    expect(await actions.importFile(file(project({ version: 2 })))).toBe(0);
    expect(await store.list()).toEqual([]);
    expect(toast()).toBe('Die Datei stammt von einer neueren Version.');
  });

  it('beschädigtes Projekt: Fehlermeldung, nichts gespeichert', async () => {
    const { store, actions } = setup(true);
    expect(await actions.importFile(file(project({ version: 0 })))).toBe(0);
    expect(await store.list()).toEqual([]);
    expect(toast()).toMatch(/beschädigt/);
  });

  it('Unsinn bleibt bei der Workspace-Meldung, nichts gespeichert', async () => {
    const { store, actions } = setup(true);
    expect(await actions.importFile(file('{kaputt'))).toBe(0);
    expect(await actions.importFile(file({ a: 1 }))).toBe(0);
    expect(await store.list()).toEqual([]);
    expect(toast()).toBe('Die Datei ist keine gültige Workspace-Datei');
  });

  it('Workspace-Dateien laufen weiter über den Workspace-Import', async () => {
    const { store, actions } = setup(true);
    const wf = { format: 'klexel-workspace', version: 1, projects: [{ kind: 'klexel', name: 'K', payload: { v: 1 } }] };
    expect(await actions.importFile(file(wf))).toBe(1);
    expect((await store.list()).map(m => m.kind)).toEqual(['klexel']);
  });
});

describe('importFile: Workspace-Datei mit Verknüpfungen', () => {
  const file = (v: unknown) => ({ text: async () => JSON.stringify(v) }) as unknown as File;
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const rig = (klexelId: string): Project => {
    const p = rigspriteDescriptor.blank();
    return {
      ...p,
      images: { i1: { id: 'i1', name: 'head', dataUrl: PNG, width: 1, height: 1, source: { projectId: klexelId, frameId: 1 } },
                i2: { id: 'i2', name: 'x', dataUrl: PNG, width: 1, height: 1, source: { projectId: 'fremd', frameId: 2 } } },
      linkedFrames: { [klexelId]: [1], fremd: [2] },
    };
  };
  const make = () => {
    const store = new WorkspaceStore(new MemoryBackend());
    const byKind = (k: string) => (k === 'rigsprite' ? rigspriteDescriptor : undefined);
    return {
      store,
      actions: createFileActions({
        store,
        prepare: async () => undefined,
        isKnownKind: k => k === 'klexel' || k === 'rigsprite',
        validatePayload: (k, p) => { const d = byKind(k); return !d || d.decode(p) !== null; },
        remapPayload: (k, p, m) => byKind(k)?.remapLinks?.(p as never, m) ?? p,
      }),
    };
  };

  it('Rigsprite-Projekt verweist nach dem Laden auf das neue Klexel-Projekt, Fremdes bleibt', async () => {
    const wf = { format: 'klexel-workspace', version: 1, projects: [
      { id: 'K-alt', kind: 'klexel', name: 'Teile', updatedAt: 1, payload: { v: 1 } },
      { id: 'R-alt', kind: 'rigsprite', name: 'Rig', updatedAt: 2, payload: rig('K-alt') },
    ] };
    const { store, actions } = make();
    expect(await actions.importFile(file(wf))).toBe(2);
    const list = await store.list();
    const k = list.find(m => m.kind === 'klexel')!, r = list.find(m => m.kind === 'rigsprite')!;
    expect(k.id).not.toBe('K-alt');
    const pl = (await store.load(r.id)) as Project;
    expect(pl.images.i1.source?.projectId).toBe(k.id);
    expect(pl.images.i2.source?.projectId).toBe('fremd');
    expect(Object.keys(pl.linkedFrames!).sort()).toEqual([k.id, 'fremd'].sort());
  });
});
