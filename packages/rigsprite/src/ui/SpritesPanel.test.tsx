// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageAsset } from '../core/part';
import { useEditor } from '../state/store';
import { makeImageAsset } from '../test/fixtures';

vi.mock('./loadImageFile', () => ({
  loadImageFile: vi.fn(async (file: File): Promise<ImageAsset> => {
    if (file.name.endsWith('.txt')) throw new Error(`${file.name} ist kein unterstütztes Bild`);
    return makeImageAsset({ id: `id-${file.name}`, name: file.name });
  }),
}));

import { SpritesPanel } from './SpritesPanel';

const upload = (...names: string[]) =>
  fireEvent.change(screen.getByLabelText('Sprites hochladen'), {
    target: { files: names.map((n) => new File(['x'], n, { type: n.endsWith('.txt') ? 'text/plain' : 'image/png' })) },
  });

beforeEach(() => useEditor.getState().newProject('humanoid'));
afterEach(cleanup);

describe('SpritesPanel', () => {
  it('uploading two files lists them and auto-attaches by name', async () => {
    render(<SpritesPanel />);
    upload('head.png', 'blob.png');
    const head = await screen.findByTestId('sprite-head.png');
    const blob = await screen.findByTestId('sprite-blob.png');
    expect(within(head).getByText('head')).toBeTruthy();
    expect(within(blob).getByRole('combobox')).toBeTruthy();
    expect(within(blob).getByText('– nicht angehängt –')).toBeTruthy();
  });

  it('choosing a bone attaches the image', async () => {
    render(<SpritesPanel />);
    upload('blob.png');
    const blob = await screen.findByTestId('sprite-blob.png');
    fireEvent.change(within(blob).getByRole('combobox'), { target: { value: 'torso' } });
    await waitFor(() => expect(useEditor.getState().project.parts.some((p) => p.boneId === 'torso')).toBe(true));
    expect(within(await screen.findByTestId('sprite-blob.png')).getByText('torso')).toBeTruthy();
  });

  it('non-image shows error', async () => {
    render(<SpritesPanel />);
    upload('notes.txt', 'head.png');
    expect((await screen.findByRole('alert')).textContent).toContain('notes.txt ist kein unterstütztes Bild');
    expect(await screen.findByTestId('sprite-head.png')).toBeTruthy();
  });

  it('selecting an attached sprite selects its part, even when hidden', async () => {
    render(<SpritesPanel />);
    upload('head.png');
    const row = await screen.findByTestId('sprite-head.png');
    const part = useEditor.getState().project.parts.find((p) => p.imageId === 'id-head.png')!;
    useEditor.getState().updatePart(part.id, { visible: false });
    fireEvent.click(within(row).getByRole('button', { name: 'head.png auswählen' }));
    expect(useEditor.getState().selectedPartId).toBe(part.id);
    expect(useEditor.getState().selectedBoneId).toBe(part.boneId);
  });
});
