import { describe, it, expect } from 'vitest';
import { classifyProjectFile } from './classifyProjectFile';

const rigsprite = () => ({
  version: 1, name: 'Held', rigTemplateId: 'humanoid', rig: { bones: [] }, images: {}, parts: [], animations: [], settings: {},
});

describe('classifyProjectFile', () => {
  it('erkennt Workspace-Dateien am Format-Kennzeichen', () => {
    expect(classifyProjectFile({ format: 'klexel-workspace', version: 1, projects: [] })).toBe('workspace');
  });
  it('erkennt ein Rigsprite-Projekt am Inhalt', () => {
    expect(classifyProjectFile(rigsprite())).toBe('rigsprite-project');
  });
  it('Workspace-Kennzeichen hat Vorrang', () => {
    expect(classifyProjectFile({ ...rigsprite(), format: 'klexel-workspace' })).toBe('workspace');
  });
  it('Rigsprite-ähnlich ohne rig ist unbekannt', () => {
    const { rig: _rig, ...rest } = rigsprite();
    expect(classifyProjectFile(rest)).toBe('unknown');
    expect(classifyProjectFile({ ...rigsprite(), rig: {} })).toBe('unknown');
    expect(classifyProjectFile({ ...rigsprite(), parts: {} })).toBe('unknown');
  });
  it('Unsinn ist unbekannt', () => {
    for (const v of [{}, { a: 1 }, [], [rigsprite()], null, undefined, 'text', 42, true]) expect(classifyProjectFile(v)).toBe('unknown');
  });
});
