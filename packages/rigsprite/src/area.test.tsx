// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render/SkinRenderer', () => ({
  SkinRenderer: class {
    constructor() {
      throw new Error('kein WebGL2');
    }
  },
}));

import type { AreaHandle, AreaHost } from '@suite/shared';
import { mountRigsprite, thumbnailOf } from './area';
import { createProject, type Project } from './core/project';
import { useEditor } from './state/store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: HTMLElement;
let handle: AreaHandle<Project> | undefined;
let hostActive = true;
const host = {
  onChange: vi.fn(),
  requestNewProject: vi.fn(),
  openProjects: vi.fn(),
  isActive: () => hostActive,
} satisfies AreaHost;

const key = (code: string, opts: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, ...opts }));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  hostActive = true;
  host.onChange.mockClear();
  host.requestNewProject.mockClear();
  root = document.createElement('div');
  document.body.appendChild(root);
  act(() => {
    handle = mountRigsprite(root, host);
  });
});

afterEach(() => {
  act(() => handle?.destroy());
  handle = undefined;
  root.remove();
  vi.restoreAllMocks();
});

describe('rigspriteArea', () => {
  it('rendert die Oberfläche mit Knopf „Projekte"', () => {
    expect(root.querySelector('.toolbar')).not.toBeNull();
    expect(root.querySelector('.timeline')).not.toBeNull();
    const btn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Projekte')!;
    act(() => btn.click());
    expect(host.openProjects).toHaveBeenCalledTimes(1);
  });

  it('Wurzel trägt die Bereichs-Klasse (Styles gelten nur darin); Knopf „Projekte" hat eine eigene Klasse', () => {
    expect(root.classList.contains('area-rigsprite')).toBe(true);
    const btn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Projekte')!;
    expect(btn.classList.contains('tb-projects')).toBe(true);
  });

  it('open setzt den Store, leert den Undo-Verlauf und meldet keine Änderung', () => {
    const p = createProject('quadruped', 'Hund');
    act(() => useEditor.getState().setProjectName('vorher'));
    host.onChange.mockClear();
    act(() => handle!.open(p));
    expect(useEditor.getState().project).toBe(p);
    expect(handle!.snapshot()).toBe(p);
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0);
    expect(host.onChange).not.toHaveBeenCalled();
  });

  it('jede Projekt-Änderung meldet onChange genau einmal, Ansichts-Zustand nicht', () => {
    act(() => handle!.open(createProject('humanoid')));
    act(() => useEditor.getState().setProjectName('A'));
    expect(host.onChange).toHaveBeenCalledTimes(1);
    act(() => useEditor.getState().setOrbit(30, 10));
    act(() => useEditor.getState().select('hip'));
    act(() => useEditor.getState().setView({ x: 5, y: 5, zoom: 2 }));
    expect(host.onChange).toHaveBeenCalledTimes(1);
    act(() => useEditor.getState().setProjectName('B'));
    expect(host.onChange).toHaveBeenCalledTimes(2);
  });

  it('flush schließt eine offene Transaktion ab und meldet', () => {
    act(() => handle!.open(createProject('humanoid')));
    const s = useEditor.getState();
    act(() => {
      s.beginTransaction();
      useEditor.getState().setProjectName('gezogen');
    });
    expect(host.onChange).not.toHaveBeenCalled();
    act(() => handle!.flush());
    expect(useEditor.getState().transaction).toBeNull();
    expect(handle!.snapshot().name).toBe('gezogen');
    expect(host.onChange).toHaveBeenCalled();
  });

  it('Tastenkürzel nur, wenn aktiv und die Hülle den Bereich freigibt', () => {
    act(() => handle!.open(createProject('humanoid')));
    const before = useEditor.getState().showRig;
    handle!.setActive(false);
    act(() => void key('KeyH'));
    expect(useEditor.getState().showRig).toBe(before);
    handle!.setActive(true);
    hostActive = false;
    act(() => void key('KeyH'));
    expect(useEditor.getState().showRig).toBe(before);
    hostActive = true;
    act(() => void key('KeyH'));
    expect(useEditor.getState().showRig).toBe(!before);
  });

  it('Strg+Z wirkt nicht, solange der Bereich inaktiv ist', () => {
    act(() => handle!.open(createProject('humanoid')));
    act(() => useEditor.getState().setProjectName('geändert'));
    handle!.setActive(false);
    act(() => void key('KeyZ', { ctrlKey: true }));
    expect(useEditor.getState().project.name).toBe('geändert');
    handle!.setActive(true);
    act(() => void key('KeyZ', { ctrlKey: true }));
    expect(useEditor.getState().project.name).not.toBe('geändert');
  });

  it('destroy meldet ab und hängt aus', () => {
    act(() => handle!.destroy());
    handle = undefined;
    expect(root.childElementCount).toBe(0);
    act(() => useEditor.getState().setProjectName('danach'));
    expect(host.onChange).not.toHaveBeenCalled();
  });

  it('„Neu" legt in der Suite ein neues Workspace-Projekt an, statt das offene zu ersetzen', () => {
    const p = createProject('humanoid', 'Bleibt');
    act(() => handle!.open(p));
    const btn = (text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!;
    act(() => btn('Neu').click());
    act(() => btn('Vierbeiner').click());
    expect(useEditor.getState().project).toBe(p);
    expect(host.requestNewProject).toHaveBeenCalledTimes(1);
    const [init, content] = host.requestNewProject.mock.calls[0] as unknown as [unknown, Project];
    expect(init).toBeUndefined();
    expect(content.rigTemplateId).toBe('quadruped');
  });

  it('ohne Viewport keine Vorschau', () => {
    expect(thumbnailOf(null)).toBeUndefined();
    expect(handle!.thumbnail()).toBeUndefined();
  });
});
