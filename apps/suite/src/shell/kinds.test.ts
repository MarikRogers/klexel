// @vitest-environment jsdom
// Projekt-Arten in der Liste: Bereichswechsel (Umschalter oben) und Projekte von Arten ohne Bereich.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectMeta } from '@suite/shared';
import { areaSegments, latestOfKind, newestOfKind } from './listModel';
import { createProjectList, type ProjectListDeps } from './projectList';

const meta = (id: string, kind: string, updatedAt: number): ProjectMeta => ({ id, kind: kind as ProjectMeta['kind'], name: id, updatedAt });

describe('latestOfKind', () => {
  it('liefert das zuletzt geänderte Projekt der Art', () => {
    const list = [meta('k1', 'klexel', 50), meta('r1', 'rigsprite', 10), meta('r2', 'rigsprite', 30), meta('r3', 'rigsprite', 20)];
    expect(latestOfKind(list, 'rigsprite')?.id).toBe('r2');
    expect(latestOfKind(list, 'klexel')?.id).toBe('k1');
  });
  it('ohne Projekt der Art: undefined', () => {
    expect(latestOfKind([meta('k1', 'klexel', 1)], 'rigsprite')).toBeUndefined();
    expect(latestOfKind([], 'klexel')).toBeUndefined();
  });
  it('newestOfKind: alle Projekte der Art, neuestes zuerst, Gleichstand in Listenreihenfolge', () => {
    const list = [meta('r1', 'rigsprite', 10), meta('k1', 'klexel', 50), meta('r2', 'rigsprite', 30), meta('r3', 'rigsprite', 30)];
    expect(newestOfKind(list, 'rigsprite').map(m => m.id)).toEqual(['r2', 'r3', 'r1']);
    expect(newestOfKind(list, 'klexel').map(m => m.id)).toEqual(['k1']);
    expect(newestOfKind([], 'klexel')).toEqual([]);
  });
});

describe('areaSegments', () => {
  const kinds = [{ kind: 'klexel', title: 'Klexel' }, { kind: 'rigsprite', title: 'Rigsprite' }];
  it('nur bei mehr als einem Bereich', () => {
    expect(areaSegments([kinds[0]!], 'klexel')).toBeNull();
    expect(areaSegments([], null)).toBeNull();
  });
  it('Segmente in Build-Reihenfolge, gewählt ist der Bereich des offenen Projekts', () => {
    expect(areaSegments(kinds, 'rigsprite')).toEqual([
      { kind: 'klexel', title: 'Klexel', current: false },
      { kind: 'rigsprite', title: 'Rigsprite', current: true },
    ]);
    expect(areaSegments(kinds, null)?.map(s => s.current)).toEqual([false, false]);
  });
});

// jsdom kennt showModal/close nur teilweise
beforeEach(() => {
  document.body.replaceChildren();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); };
});

function deps(over: Partial<ProjectListDeps> & { metas: ProjectMeta[]; kinds: ProjectListDeps['kinds'] }): ProjectListDeps {
  const openable = over.kinds.map(k => k.kind);
  return {
    list: async () => over.metas,
    currentId: () => null,
    currentKind: () => 'klexel',
    canOpen: m => openable.includes(m.kind),
    open: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    duplicate: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    switchArea: vi.fn(async () => undefined),
    exportAll: vi.fn(async () => undefined),
    exportOne: vi.fn(async () => undefined),
    importFile: vi.fn(async () => undefined),
    ...over,
  };
}

const flush = () => new Promise(r => setTimeout(r, 0));
const dlg = () => document.getElementById('projectsDlg') as HTMLDialogElement;
const buttons = (li: Element) => Object.fromEntries([...li.querySelectorAll('button')].map(b => [b.textContent, b as HTMLButtonElement]));

describe('Projektliste: Art ohne Bereich', () => {
  it('„nicht verfügbar": Öffnen/Duplizieren gesperrt, Umbenennen/Export/Löschen möglich', async () => {
    const d = deps({ metas: [meta('r1', 'rigsprite', 1), meta('k1', 'klexel', 2)], kinds: [{ kind: 'klexel', title: 'Klexel', sized: true }] });
    createProjectList(d).open();
    await flush();
    const [r, k] = [...dlg().querySelectorAll('.pl-item')];
    expect(r!.classList.contains('unavailable')).toBe(true);
    expect(r!.textContent).toContain('nicht verfügbar');
    expect(r!.textContent).toContain('Rigsprite');
    const rb = buttons(r!);
    expect(rb['Öffnen']!.disabled).toBe(true);
    expect(rb['Duplizieren']!.disabled).toBe(true);
    expect(rb['Umbenennen']!.disabled).toBe(false);
    expect(rb['Als Datei sichern']!.disabled).toBe(false);
    expect(rb['Löschen']!.disabled).toBe(false);
    rb['Als Datei sichern']!.click();
    await flush();
    expect(d.exportOne).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    expect(k!.classList.contains('unavailable')).toBe(false);
    expect(buttons(k!)['Öffnen']!.disabled).toBe(false);
  });
});

describe('Projektliste: Bereichswechsel', () => {
  const both = [{ kind: 'klexel', title: 'Klexel', sized: true }, { kind: 'rigsprite', title: 'Rigsprite', sized: false }];

  it('Umschalter zeigt den Bereich des offenen Projekts; der andere wechselt und schließt die Liste', async () => {
    const d = deps({ metas: [], kinds: both, currentKind: () => 'klexel' });
    createProjectList(d).open();
    await flush();
    const segs = [...dlg().querySelectorAll<HTMLButtonElement>('.pl-areas .pl-area')];
    expect(segs.map(s => s.textContent)).toEqual(['Klexel', 'Rigsprite']);
    expect(segs.map(s => s.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    segs[1]!.click();
    await flush();
    expect(d.switchArea).toHaveBeenCalledWith('rigsprite');
    expect(dlg().open).toBe(false);
  });

  it('Klick auf den aktuellen Bereich wechselt nicht', async () => {
    const d = deps({ metas: [], kinds: both, currentKind: () => 'rigsprite' });
    createProjectList(d).open();
    await flush();
    dlg().querySelector<HTMLButtonElement>('.pl-area[data-kind="rigsprite"]')!.click();
    await flush();
    expect(d.switchArea).not.toHaveBeenCalled();
    expect(dlg().open).toBe(true);
  });

  it('nur ein Bereich: kein Umschalter', async () => {
    createProjectList(deps({ metas: [], kinds: [both[0]!] })).open();
    await flush();
    expect(dlg().querySelector('.pl-areas')!.hasAttribute('hidden')).toBe(true);
    expect(dlg().querySelectorAll('.pl-area')).toHaveLength(0);
  });
});
