// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReturnRequest } from '@suite/shared';
import { animationFrameSize } from '../core/animationFrames';
import { createProject, type Project } from '../core/project';
import { ANIMATION_TEMPLATES, applyAnimationTemplate } from '../core/templates/animations';
import type { renderAnimationFrames } from '../render/renderSheet';
import { useEditor } from '../state/store';
import { makeImageAsset, makePart } from '../test/fixtures';
import { ExportDialog } from './ExportDialog';
import { ReturnToKlexelDialog } from './ReturnToKlexelDialog';
import { LIMIT_TEXT, initialOptions, planFor, warningText } from './returnDialogLogic';
import { SuiteContext, type SuiteBridge } from './suiteBridge';

/** Humanoid mit einem Bild der Größe w×h und der Walk-Vorlage (Länge optional). */
function project(w = 20, h = 40, length?: number): Project {
  const p = createProject('humanoid');
  const walkT = ANIMATION_TEMPLATES.find((t) => t.rigTemplateId === 'humanoid' && t.name === 'walk')!;
  const walk = { ...applyAnimationTemplate(walkT, p.rig), ...(length ? { length } : {}) };
  return {
    ...p,
    images: { img: makeImageAsset({ width: w, height: h }) },
    parts: [makePart({ boneId: p.rig.bones[0].id })],
    animations: [walk],
  };
}

/** Fake-Renderer: Frames der geplanten Größe, Pixelwert = Frame-Index + 1 (GL gibt es in Node nicht). */
const renderFrames: typeof renderAnimationFrames = async (p, id, range) => {
  const size = animationFrameSize(p, id)!;
  const frames: Uint32Array[] = [];
  for (let i = range!.from; i <= range!.to; i++) frames.push(new Uint32Array(size.width * size.height).fill(i + 1));
  return { ok: true, width: size.width, height: size.height, fps: size.fps, name: 'walk', frames };
};
const fakeRender = vi.fn(renderFrames);

const bridge = (over: Partial<SuiteBridge> = {}): SuiteBridge => ({
  openProjects: vi.fn(),
  newProject: vi.fn(),
  returnToKlexel: vi.fn(async (r: ReturnRequest) => ({ projectId: `k-${r.frames.length}`, name: `${r.name} (aus Rigsprite)` })),
  openProject: vi.fn(async () => undefined),
  ...over,
});

const show = (suite: SuiteBridge | null, onClose = vi.fn()) =>
  render(
    <SuiteContext.Provider value={suite}>
      <ReturnToKlexelDialog onClose={onClose} render={fakeRender} />
    </SuiteContext.Provider>,
  );

const createBtn = () => screen.getByRole('button', { name: /anlegen/i }) as HTMLButtonElement;
const currentSize = () => {
  const p = useEditor.getState().project;
  return animationFrameSize(p, p.animations[0].id)!;
};

beforeEach(() => { fakeRender.mockClear(); });
afterEach(cleanup);

describe('returnDialogLogic', () => {
  it('Planung → Warnung → Vorschlag passt', () => {
    const size = { width: 300, height: 100, frameCount: 80, fps: 12 };
    const opts = initialOptions(size);
    expect(opts).toEqual({ scale: 1, from: 0, to: 79 });
    const plan = planFor(size, opts)!;
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(warningText(size, opts, plan)).toBe(`${LIMIT_TEXT} (gewählt: Bild 300×100 Pixel, 80 Frames).`);
    expect(LIMIT_TEXT).toBe('Zu groß für Klexel: höchstens 128×128 Pixel und 64 Frames');
    expect(planFor(size, plan.suggestion)).toEqual({ ok: true, width: 100, height: 34, frames: 64 });
  });
});

describe('ReturnToKlexelDialog', () => {
  it('passende Animation: zeigt Größe, legt mit den Frames an und bietet „In Klexel öffnen"', async () => {
    useEditor.getState().loadProject(project());
    const suite = bridge();
    const onClose = vi.fn();
    show(suite, onClose);
    const size = currentSize();
    expect(screen.getByTestId('return-size').textContent).toContain(`${size.width}×${size.height} Pixel · ${size.frameCount} Frames`);
    expect(createBtn().disabled).toBe(false);
    fireEvent.click(createBtn());
    expect(await screen.findByText(/wurde als Klexel-Projekt angelegt/)).toBeTruthy();
    const req = vi.mocked(suite.returnToKlexel!).mock.calls[0][0];
    expect(req).toMatchObject({ name: 'walk', width: size.width, height: size.height, fps: size.fps });
    expect(req.origin.animationId).toBe(useEditor.getState().project.animations[0].id);
    expect(req.frames).toHaveLength(size.frameCount);
    expect(req.frames[2].pixels[0]).toBe(3);
    // erneut: ein weiterer Aufruf (neues Projekt)
    fireEvent.click(createBtn());
    await waitFor(() => expect(suite.returnToKlexel).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: 'In Klexel öffnen' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(suite.openProject).toHaveBeenCalledWith(`k-${size.frameCount}`);
  });

  it('zu groß: Warnung, „Anlegen" gesperrt und nichts angelegt; Vorschlag übernehmen → verkleinert anlegen', async () => {
    useEditor.getState().loadProject(project(200, 300, 70));
    const suite = bridge();
    show(suite);
    const size = currentSize();
    expect(size.height).toBeGreaterThan(128);
    expect(screen.getByRole('alert').textContent).toContain('Zu groß für Klexel: höchstens 128×128 Pixel und 64 Frames');
    expect(createBtn().disabled).toBe(true);
    fireEvent.click(createBtn());
    expect(suite.returnToKlexel).not.toHaveBeenCalled();
    expect(fakeRender).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Vorschlag übernehmen' }));
    expect(screen.queryByRole('alert')).toBeNull();
    const scale = Number((screen.getByLabelText('Maßstab (Teiler)') as HTMLInputElement).value);
    expect(scale).toBeGreaterThan(1);
    expect((screen.getByLabelText('Letzter Frame') as HTMLInputElement).value).toBe('64');
    expect(createBtn().disabled).toBe(false);
    fireEvent.click(createBtn());
    await screen.findByText(/wurde als Klexel-Projekt angelegt/);
    expect(fakeRender).toHaveBeenCalledWith(expect.anything(), expect.any(String), { from: 0, to: 63 });
    const req = vi.mocked(suite.returnToKlexel!).mock.calls[0][0];
    expect(req.width).toBe(Math.ceil(size.width / scale));
    expect(req.height).toBe(Math.ceil(size.height / scale));
    expect(req.width).toBeLessThanOrEqual(128);
    expect(req.height).toBeLessThanOrEqual(128);
    expect(req.frames).toHaveLength(64);
    expect(req.frames[0].pixels).toHaveLength(req.width * req.height); // herunterskaliert
  });

  it('manuelle Eingabe: ungültiger Bereich sperrt, gültiger gibt frei (1-basiert in der Oberfläche)', () => {
    useEditor.getState().loadProject(project(20, 40, 10));
    show(bridge());
    fireEvent.change(screen.getByLabelText('Erster Frame'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Letzter Frame'), { target: { value: '3' } });
    expect(createBtn().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Ungültige Angaben');
    fireEvent.change(screen.getByLabelText('Letzter Frame'), { target: { value: '7' } });
    expect(createBtn().disabled).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('3 Frames');
  });

  it('Fehler der Hülle wird angezeigt', async () => {
    useEditor.getState().loadProject(project());
    show(bridge({ returnToKlexel: vi.fn(async () => Promise.reject(new Error('Klexel-Projekt konnte nicht gespeichert werden'))) }));
    fireEvent.click(createBtn());
    expect((await screen.findByText('Klexel-Projekt konnte nicht gespeichert werden')).getAttribute('role')).toBe('alert');
  });
});

describe('ExportDialog: „Nach Klexel…"', () => {
  beforeEach(() => useEditor.getState().loadProject(project()));
  const exportWith = (suite: SuiteBridge | null) =>
    render(
      <SuiteContext.Provider value={suite}>
        <ExportDialog onClose={vi.fn()} />
      </SuiteContext.Provider>,
    );

  it('nur mit host.returnToKlexel sichtbar; öffnet den Rückgabe-Dialog', () => {
    exportWith(bridge({ returnToKlexel: undefined }));
    expect(screen.queryByRole('button', { name: 'Nach Klexel…' })).toBeNull();
    cleanup();
    exportWith(null);
    expect(screen.queryByRole('button', { name: 'Nach Klexel…' })).toBeNull();
    cleanup();
    exportWith(bridge());
    fireEvent.click(screen.getByRole('button', { name: 'Nach Klexel…' }));
    expect(screen.getByRole('dialog', { name: 'Nach Klexel' })).toBeTruthy();
  });
});
