// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditor } from '../state/store';
import { makeImageAsset } from '../test/fixtures';
import { renderWithShortcuts } from '../test/renderWithShortcuts';
import { Toolbar } from './Toolbar';

const addImage = () =>
  useEditor.getState().addImages([makeImageAsset({ id: 'i', name: 'blob.png', width: 4, height: 4 })]);

beforeEach(() => useEditor.getState().newProject('humanoid'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Toolbar discard confirmation', () => {
  it('Neu asks for confirmation when only unattached images exist', () => {
    addImage();
    expect(useEditor.getState().project.parts).toHaveLength(0);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Neu' }));
    expect(confirm).toHaveBeenCalledWith('Aktuelles Projekt verwerfen?');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Öffnen asks for confirmation when the project has content and aborts on cancel', () => {
    addImage();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(confirm).toHaveBeenCalledWith('Aktuelles Projekt verwerfen?');
    expect(click).not.toHaveBeenCalled();
  });

  it('Öffnen opens the file picker after confirmation', () => {
    addImage();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Öffnen on an empty project does not ask', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('Toolbar camera keys', () => {
  const rot = () => useEditor.getState().project.settings.cameraRotation;
  afterEach(() => useEditor.getState().cancelTransaction());

  it('Q/E turn the camera by 15 degrees', () => {
    renderWithShortcuts(<Toolbar />);
    fireEvent.keyDown(window, { code: 'KeyE' });
    expect(rot()).toBe(15);
    fireEvent.keyDown(window, { code: 'KeyQ' });
    expect(rot()).toBe(0);
  });

  it('Q/E are ignored during an active viewport drag', () => {
    renderWithShortcuts(<Toolbar />);
    useEditor.getState().beginTransaction();
    fireEvent.keyDown(window, { code: 'KeyE' });
    expect(rot()).toBe(0);
    useEditor.getState().cancelTransaction();
    fireEvent.keyDown(window, { code: 'KeyE' });
    expect(rot()).toBe(15);
  });

  it('camera and undo/redo buttons do nothing during a drag', () => {
    useEditor.getState().setProjectName('Vorher');
    renderWithShortcuts(<Toolbar />);
    useEditor.getState().beginTransaction();
    useEditor.getState().setProjectName('Während');
    fireEvent.click(screen.getByRole('button', { name: '⟳ 90°' }));
    expect(rot()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(useEditor.getState().project.name).toBe('Während');
    useEditor.getState().commitTransaction();
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(useEditor.getState().project.name).toBe('Vorher');
    fireEvent.click(screen.getByRole('button', { name: '⟳ 90°' }));
    expect(rot()).toBe(90);
  });

  it('rounds floating drift in the camera angle', () => {
    renderWithShortcuts(<Toolbar />);
    const input = screen.getByLabelText('Kamera') as HTMLInputElement;
    fireEvent.change(input, { target: { value: String(0.1 + 0.2) } });
    fireEvent.blur(input);
    expect(rot()).toBe(0.3);
  });
});

describe('Toolbar camera yaw controls', () => {
  const settings = () => useEditor.getState().project.settings;
  const orbit = () => useEditor.getState().orbit;
  const past = () => useEditor.temporal.getState().pastStates.length;
  beforeEach(() => useEditor.setState({ orbit: { yaw: 0, pitch: 0 } }));
  afterEach(() => useEditor.getState().cancelTransaction());

  it('has no horizontal yaw field any more (the orbit panel replaces it)', () => {
    renderWithShortcuts(<Toolbar />);
    expect(screen.queryByLabelText('Horizontal')).toBeNull();
    expect(screen.queryByText(/↔/)).toBeNull();
    expect(past()).toBe(0);
  });

  it('Kamera zurücksetzen is enabled when only the orbit is turned', () => {
    renderWithShortcuts(<Toolbar />);
    const reset = screen.getByRole('button', { name: 'Kamera zurücksetzen' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    act(() => useEditor.getState().setOrbit(0, 15));
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(orbit()).toEqual({ yaw: 0, pitch: 0 });
    expect(settings().cameraRotation).toBe(0);
    expect(reset.disabled).toBe(true);
  });

  it('Spiegeln toggles the mirror setting and reports it via aria-pressed', () => {
    renderWithShortcuts(<Toolbar />);
    const button = screen.getByRole('button', { name: 'Spiegeln' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(settings().mirror).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(orbit().yaw).toBe(0);
    fireEvent.click(button);
    expect(settings().mirror).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    act(() => useEditor.getState().setOrbit(180, 0));
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('Kamera zurücksetzen resets roll and orbit, keeps the mirror; disabled when roll and orbit are 0', () => {
    renderWithShortcuts(<Toolbar />);
    const reset = screen.getByRole('button', { name: 'Kamera zurücksetzen' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    fireEvent.keyDown(window, { code: 'KeyM' });
    expect(reset.disabled).toBe(true);
    fireEvent.keyDown(window, { code: 'KeyD' });
    expect(reset.disabled).toBe(false);
    fireEvent.keyDown(window, { code: 'KeyE' });
    fireEvent.click(reset);
    expect(settings()).toMatchObject({ cameraRotation: 0, mirror: true });
    expect(orbit()).toEqual({ yaw: 0, pitch: 0 });
    expect(reset.disabled).toBe(true);
    act(() => useEditor.getState().undo());
    expect(settings()).toMatchObject({ cameraRotation: 15, mirror: true });
  });

  it('A / D / M work through the global listener; Spiegeln does nothing during a drag', () => {
    renderWithShortcuts(<Toolbar />);
    fireEvent.keyDown(window, { code: 'KeyD' });
    expect(orbit().yaw).toBe(15);
    fireEvent.keyDown(window, { code: 'KeyA' });
    expect(orbit().yaw).toBe(0);
    useEditor.getState().beginTransaction();
    fireEvent.click(screen.getByRole('button', { name: 'Spiegeln' }));
    fireEvent.keyDown(window, { code: 'KeyM' });
    expect(settings().mirror).toBe(false);
  });
});

describe('Toolbar project name', () => {
  it('commits a trimmed name on Enter and blur', () => {
    render(<Toolbar />);
    const input = screen.getByLabelText('Projektname') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  Zwerg  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useEditor.getState().project.name).toBe('Zwerg');
    fireEvent.change(input, { target: { value: 'Elf' } });
    fireEvent.blur(input);
    expect(useEditor.getState().project.name).toBe('Elf');
  });

  it('Enter commits and returns focus to the app (input blurred)', () => {
    render(<Toolbar />);
    const input = screen.getByLabelText('Projektname') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'Gnom' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useEditor.getState().project.name).toBe('Gnom');
    expect(document.activeElement).not.toBe(input);
  });

  it('keeps the old name for an empty entry and reverts on Escape', () => {
    useEditor.getState().setProjectName('Alt');
    render(<Toolbar />);
    const input = screen.getByLabelText('Projektname') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(useEditor.getState().project.name).toBe('Alt');
    expect(input.value).toBe('Alt');
    fireEvent.change(input, { target: { value: 'Neu' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('Alt');
    fireEvent.blur(input);
    expect(useEditor.getState().project.name).toBe('Alt');
  });
});
