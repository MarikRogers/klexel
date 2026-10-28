// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectMeta, SourceResult, SourceService } from '@suite/shared';
import type { LinkedSyncSummary } from '../areaLogic';
import { createProject } from '../core/project';
import { useEditor } from '../state/store';
import { LinkSourceDialog } from './LinkSourceDialog';
import { useGlobalShortcuts } from './shortcuts';
import { SpritesPanel, syncMessage } from './SpritesPanel';
import { SuiteContext, type SuiteBridge } from './suiteBridge';

const meta = (id: string, name: string): ProjectMeta => ({ id, kind: 'klexel', name, updatedAt: Date.UTC(2026, 9, 28, 10, 30) });
const result = (px = 'A'): SourceResult => ({
  projectName: 'Figur',
  frames: [
    { frameId: 1, name: 'upperArm_L', width: 4, height: 4, dataUrl: `data:image/png;base64,${px}1` },
    { frameId: 2, name: 'head', width: 4, height: 4, dataUrl: `data:image/png;base64,${px}2` },
  ],
});

function fakeSources(over: Partial<SourceService> = {}): SourceService {
  return { list: vi.fn(async () => [meta('k1', 'Figur'), meta('k2', 'Baum')]), read: vi.fn(async () => result()), ...over };
}

const bridge = (sources?: SourceService, sync?: () => Promise<LinkedSyncSummary>): SuiteBridge => ({
  openProjects: vi.fn(),
  newProject: vi.fn(),
  ...(sources ? { sources, syncSources: sync ?? vi.fn(async () => ({ updated: 0, missing: 0, added: 0, failed: 0 })) } : {}),
});

const renderPanel = (suite: SuiteBridge | null) =>
  render(
    <SuiteContext.Provider value={suite}>
      <SpritesPanel />
    </SuiteContext.Provider>,
  );

beforeEach(() => useEditor.getState().loadProject(createProject('humanoid')));
afterEach(cleanup);

describe('LinkSourceDialog', () => {
  it('listet die Klexel-Projekte mit Datum; Auswahl verknüpft die Frames und meldet die Anzahl', async () => {
    const sources = fakeSources();
    const onClose = vi.fn();
    const onLinked = vi.fn();
    render(<LinkSourceDialog sources={sources} onClose={onClose} onLinked={onLinked} />);
    const item = await screen.findByRole('button', { name: /Figur/ });
    expect(screen.getByRole('button', { name: /Baum/ })).toBeTruthy();
    expect(item.textContent).toMatch(/28\.10\.26/);
    fireEvent.click(item);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sources.read).toHaveBeenCalledWith('k1');
    expect(onLinked).toHaveBeenCalledWith(2, 'Figur');
    const imgs = Object.values(useEditor.getState().project.images);
    expect(imgs.map((i) => i.source)).toEqual([
      { projectId: 'k1', frameId: 1, name: 'upperArm_L' },
      { projectId: 'k1', frameId: 2, name: 'head' },
    ]);
    // automatisch per Namen an Knochen gehängt
    expect(useEditor.getState().project.parts.map((p) => p.boneId).sort()).toEqual(['head', 'upperArm_L']);
  });

  it('leere Liste: „Keine Klexel-Projekte vorhanden"', async () => {
    render(<LinkSourceDialog sources={fakeSources({ list: async () => [] })} onClose={vi.fn()} onLinked={vi.fn()} />);
    expect((await screen.findByText('Keine Klexel-Projekte vorhanden')).getAttribute('role')).toBe('status');
  });

  it('Fehler beim Laden der Liste und beim Lesen werden angezeigt; nichts wird verknüpft', async () => {
    const { unmount } = render(
      <LinkSourceDialog sources={fakeSources({ list: async () => Promise.reject(new Error('weg')) })} onClose={vi.fn()} onLinked={vi.fn()} />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain('weg');
    unmount();
    const onClose = vi.fn();
    render(<LinkSourceDialog sources={fakeSources({ read: async () => null })} onClose={onClose} onLinked={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Figur/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('nicht mehr vorhanden');
    expect(onClose).not.toHaveBeenCalled();
    expect(Object.keys(useEditor.getState().project.images)).toHaveLength(0);
  });

  it.each(['Escape', 'Abbrechen'])('%s während des Lesens: das Ergebnis verknüpft nichts mehr', async (how) => {
    let release!: (r: SourceResult) => void;
    const onClose = vi.fn();
    const onLinked = vi.fn();
    const sources = fakeSources({ read: () => new Promise((res) => (release = res)) });
    function Harness() {
      useGlobalShortcuts(); // Escape läuft über die globalen Tastenkürzel
      return <LinkSourceDialog sources={sources} onClose={onClose} onLinked={onLinked} />;
    }
    const { unmount } = render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: /Figur/ }));
    if (how === 'Escape') fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    else fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount(); // der Aufrufer schließt den Dialog
    release(result());
    await new Promise((r) => setTimeout(r, 0));
    expect(onLinked).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(Object.keys(useEditor.getState().project.images)).toHaveLength(0);
  });

  it('Verknüpfen ist ein Undo-Schritt', async () => {
    render(<LinkSourceDialog sources={fakeSources()} onClose={vi.fn()} onLinked={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Figur/ }));
    await waitFor(() => expect(Object.keys(useEditor.getState().project.images)).toHaveLength(2));
    useEditor.getState().undo();
    expect(Object.keys(useEditor.getState().project.images)).toHaveLength(0);
  });
});

describe('SpritesPanel: Klexel-Verknüpfung', () => {
  it('ohne Quellen-Dienst (eigenständig oder ohne Klexel) kein „Aus Klexel…"', () => {
    renderPanel(null);
    expect(screen.queryByRole('button', { name: 'Aus Klexel…' })).toBeNull();
    cleanup();
    renderPanel(bridge());
    expect(screen.queryByRole('button', { name: 'Aus Klexel…' })).toBeNull();
  });

  it('„Aus Klexel…" öffnet den Dialog; danach Meldung mit der Anzahl und Kennzeichen an den Bildern', async () => {
    renderPanel(bridge(fakeSources()));
    expect(screen.queryByRole('button', { name: 'Aktualisieren' })).toBeNull(); // noch nichts verknüpft
    fireEvent.click(screen.getByRole('button', { name: 'Aus Klexel…' }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: /Figur/ }));
    expect((await screen.findByText('2 Sprites aus „Figur" hinzugefügt')).getAttribute('role')).toBe('status');
    expect(screen.queryByRole('dialog')).toBeNull();
    const row = await screen.findByTestId('sprite-head');
    const mark = within(row).getByLabelText(/^Verknüpft mit/);
    await waitFor(() => expect(mark.getAttribute('title')).toBe('Verknüpft mit Klexel-Projekt „Figur", Frame „head"'));
    expect(within(row).queryByText('Quelle fehlt')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aktualisieren' })).toBeTruthy();
  });

  it('„Quelle fehlt" als sichtbarer Text bei fehlender Quelle', () => {
    const p = createProject('humanoid');
    p.images.x = {
      id: 'x', name: 'head', dataUrl: 'data:image/png;base64,A', width: 4, height: 4,
      source: { projectId: 'k9', frameId: 1, name: 'head', missing: true },
    };
    useEditor.getState().loadProject(p);
    renderPanel(bridge(fakeSources()));
    expect(within(screen.getByTestId('sprite-head')).getByText('Quelle fehlt')).toBeTruthy();
  });

  it('„Aktualisieren" ruft den Abgleich und zeigt das Ergebnis', async () => {
    useEditor.getState().linkSource('k1', result());
    const sync = vi.fn(async () => ({ updated: 2, missing: 0, added: 1, failed: 0 }));
    renderPanel(bridge(fakeSources(), sync));
    fireEvent.click(screen.getByRole('button', { name: 'Aktualisieren' }));
    expect(await screen.findByText('Sprites: 2 aktualisiert, 1 neu')).toBeTruthy();
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('syncMessage', () => {
    expect(syncMessage({ updated: 0, missing: 0, added: 0, failed: 0 })).toBe('Alle verknüpften Sprites sind aktuell');
    expect(syncMessage({ updated: 0, missing: 3, added: 0, failed: 0 })).toBe('Sprites: 3 ohne Quelle');
    expect(syncMessage({ updated: 1, missing: 0, added: 0, failed: 1 })).toMatch(/fehlgeschlagen/);
  });
});
