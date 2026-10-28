// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageAsset } from '../core/part';
import { makeImageAsset } from '../test/fixtures';
import { useEditor } from '../state/store';
import { polyfillBlobText } from '../test/polyfills';

polyfillBlobText();

const assets: ImageAsset[] = [
  makeImageAsset({ id: 'a1', name: 'sheet_0.png', width: 16, height: 16 }),
  makeImageAsset({ id: 'a2', name: 'sheet_1.png', width: 16, height: 16 }),
];

vi.mock('./sliceSheet', () => ({
  loadSheetImage: vi.fn(async () => ({ naturalWidth: 64, naturalHeight: 32 })),
  sliceSheet: vi.fn(async () => assets),
  drawSheetPreview: vi.fn(),
}));

import { ImportSheetDialog } from './ImportSheetDialog';

const png = () => new File(['x'], 'sheet.png', { type: 'image/png' });

beforeEach(() => {
  useEditor.getState().newProject('humanoid');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ImportSheetDialog', () => {
  it('import is disabled until a PNG is chosen', () => {
    render(<ImportSheetDialog onClose={() => {}} />);
    expect((screen.getByText('Importieren') as HTMLButtonElement).disabled).toBe(true);
  });

  it('grid import calls addImages with the sliced assets', async () => {
    const spy = vi.spyOn(useEditor.getState(), 'addImages');
    const onClose = vi.fn();
    render(<ImportSheetDialog onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Spritesheet-Bild'), { target: { files: [png()] } });
    await waitFor(() => expect((screen.getByText('Importieren') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('Importieren'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(assets));
    expect(onClose).toHaveBeenCalled();
  });

  it('atlas error shows an alert and does not import', async () => {
    const spy = vi.spyOn(useEditor.getState(), 'addImages');
    render(<ImportSheetDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spritesheet-Bild'), { target: { files: [png()] } });
    await waitFor(() => expect((screen.getByText('Importieren') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Atlas-JSON'), {
      target: { files: [new File(['{'], 'a.json', { type: 'application/json' })] },
    });
    expect((await screen.findByRole('alert')).textContent).toContain('kein gültiges JSON');
    fireEvent.click(screen.getByText('Importieren'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('an unreadable atlas file reports its name', async () => {
    render(<ImportSheetDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spritesheet-Bild'), { target: { files: [png()] } });
    await waitFor(() => expect((screen.getByText('Importieren') as HTMLButtonElement).disabled).toBe(false));
    const bad = new File(['{}'], 'broken.json', { type: 'application/json' });
    bad.text = () => Promise.reject(new Error('io'));
    fireEvent.change(screen.getByLabelText('Atlas-JSON'), { target: { files: [bad] } });
    expect((await screen.findByRole('alert')).textContent).toBe('broken.json: Die Datei konnte nicht gelesen werden.');
  });

  it('atlas frames outside the image are skipped with a warning', async () => {
    render(<ImportSheetDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spritesheet-Bild'), { target: { files: [png()] } });
    const json = JSON.stringify({
      frames: { 'a.png': { frame: { x: 0, y: 0, w: 8, h: 8 } }, 'b.png': { frame: { x: 60, y: 0, w: 8, h: 8 } } },
    });
    fireEvent.change(screen.getByLabelText('Atlas-JSON'), { target: { files: [new File([json], 'a.json')] } });
    expect((await screen.findByRole('status')).textContent).toContain('1 Frames ungültig oder außerhalb des Bildes übersprungen');
  });

  it('too many cells shows a message and disables import', async () => {
    render(<ImportSheetDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spritesheet-Bild'), { target: { files: [png()] } });
    await waitFor(() => expect((screen.getByText('Importieren') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('Modus'), { target: { value: 'size' } });
    fireEvent.change(screen.getByLabelText('Zellbreite'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Zellhöhe'), { target: { value: '1' } });
    expect((await screen.findByRole('alert')).textContent).toContain('Zu viele Zellen (max. 1024)');
    expect((screen.getByText('Importieren') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the grid values of the other mode and redraws the preview with the cells', async () => {
    const { drawSheetPreview } = await import('./sliceSheet');
    render(<ImportSheetDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spritesheet-Bild'), { target: { files: [png()] } });
    await screen.findByText('8 Zellen');
    fireEvent.change(screen.getByLabelText('Spalten'), { target: { value: '2' } });
    expect(screen.getByText('4 Zellen')).toBeTruthy();
    expect(vi.mocked(drawSheetPreview).mock.lastCall![2]).toHaveLength(4);
    fireEvent.change(screen.getByLabelText('Modus'), { target: { value: 'size' } });
    expect(screen.getByText('2 Zellen')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Modus'), { target: { value: 'count' } });
    expect((screen.getByLabelText('Spalten') as HTMLInputElement).value).toBe('2');
    expect(screen.getByText('4 Zellen')).toBeTruthy();
  });
});
