// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { MemoryBackend, WorkspaceStore } from '@suite/shared';
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

  it('beschädigtes Projekt: Fehlermeldung, nichts gespeichert', async () => {
    const { store, actions } = setup(true);
    expect(await actions.importFile(file(project({ version: 2 })))).toBe(0);
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
