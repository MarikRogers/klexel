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
    expect(within(head).getByRole('button', { name: 'head.png an head auswählen' })).toBeTruthy();
    expect(within(blob).getByRole('combobox')).toBeTruthy();
    expect(within(blob).getByText('– nicht angehängt –')).toBeTruthy();
  });

  it('choosing a bone attaches the image', async () => {
    render(<SpritesPanel />);
    upload('blob.png');
    const blob = await screen.findByTestId('sprite-blob.png');
    fireEvent.change(within(blob).getByRole('combobox'), { target: { value: 'torso' } });
    await waitFor(() => expect(useEditor.getState().project.parts.some((p) => p.boneId === 'torso')).toBe(true));
    expect(within(await screen.findByTestId('sprite-blob.png')).getByRole('button', { name: 'blob.png an torso auswählen' })).toBeTruthy();
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
    fireEvent.click(within(row).getByRole('button', { name: 'head.png an head auswählen' }));
    expect(useEditor.getState().selectedPartId).toBe(part.id);
    expect(useEditor.getState().selectedBoneId).toBe(part.boneId);
  });

  describe('multiple instances', () => {
    const st = () => useEditor.getState();
    const partsOf = (imageId: string) => st().project.parts.filter((p) => p.imageId === imageId);
    const sel = () => within(screen.getByTestId('sprite-blob.png')).getByRole('combobox');
    async function twoInstances() {
      render(<SpritesPanel />);
      upload('blob.png');
      await screen.findByTestId('sprite-blob.png');
      fireEvent.change(sel(), { target: { value: 'torso' } });
      fireEvent.change(sel(), { target: { value: 'head' } });
      return screen.getByTestId('sprite-blob.png');
    }

    it('adding via the extra select attaches independent instances of one image', async () => {
      await twoInstances();
      const [a, b] = partsOf('id-blob.png');
      expect(partsOf('id-blob.png')).toHaveLength(2);
      expect(a.id).not.toBe(b.id);
      st().updatePart(a.id, { x: 50, rotation: 33 });
      const [a2, b2] = partsOf('id-blob.png');
      expect(a2).toMatchObject({ x: 50, rotation: 33 });
      expect(b2).toEqual(b);
      expect(within(screen.getByTestId('sprite-blob.png')).getByRole('combobox', { name: 'Weiterer Bone für blob.png' })).toBeTruthy();
      expect((sel() as HTMLSelectElement).value).toBe('');
    });

    it('shows one bone button per instance with independent selection', async () => {
      const row = await twoInstances();
      const [a, b] = partsOf('id-blob.png');
      const onTorso = within(row).getByRole('button', { name: 'blob.png an torso auswählen' });
      const onHead = within(row).getByRole('button', { name: 'blob.png an head auswählen' });
      fireEvent.click(onTorso);
      expect(st().selectedPartId).toBe(a.id);
      expect(onTorso.getAttribute('aria-pressed')).toBe('true');
      expect(onHead.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(onHead);
      expect(st().selectedPartId).toBe(b.id);
      expect(st().selectedBoneId).toBe(b.boneId);
    });

    it('x on one instance removes only that part and keeps the image', async () => {
      const row = await twoInstances();
      const [a, b] = partsOf('id-blob.png');
      st().select(a.boneId, a.id);
      fireEvent.click(within(row).getByRole('button', { name: 'blob.png von torso entfernen' }));
      expect(partsOf('id-blob.png')).toEqual([b]);
      expect(st().project.images['id-blob.png']).toBeTruthy();
      expect(st().selectedPartId).toBeNull();
    });

    it('the sprite x removes the image with all instances', async () => {
      const row = await twoInstances();
      fireEvent.click(within(row).getByRole('button', { name: 'blob.png entfernen' }));
      expect(partsOf('id-blob.png')).toHaveLength(0);
      expect(st().project.images['id-blob.png']).toBeUndefined();
    });

    it('same bone twice gets disambiguated labels', async () => {
      render(<SpritesPanel />);
      upload('blob.png');
      await screen.findByTestId('sprite-blob.png');
      fireEvent.change(sel(), { target: { value: 'head' } });
      fireEvent.change(sel(), { target: { value: 'head' } });
      const row = screen.getByTestId('sprite-blob.png');
      const labels = within(row).getAllByRole('button', { name: /an head auswählen/ }).map((b) => b.textContent);
      expect(labels).toEqual(['head', 'head 2']);
    });
  });
});
