// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { selectActiveAnimation, useEditor } from '../state/store';
import { CameraControls } from './CameraControls';
import { DepthPanel } from './DepthPanel';

const editor = () => useEditor.getState();
const tiltKeys = () => selectActiveAnimation(editor())?.tracks.thigh_L?.tilt ?? [];
const past = () => useEditor.temporal.getState().pastStates.length;

beforeEach(() => {
  editor().newProject('humanoid');
  editor().addAnimation('walk');
  editor().setMode('animate');
  editor().select('thigh_L');
});
afterEach(cleanup);

describe('DepthPanel', () => {
  it('is not shown in setup mode, without a bone or without an animation', () => {
    act(() => editor().setMode('setup'));
    const { container } = render(<DepthPanel />);
    expect(container.firstChild).toBeNull();
    act(() => editor().setMode('animate'));
    expect(screen.getByRole('group', { name: 'Bewegung in der Tiefe' })).toBeTruthy();
    act(() => editor().select(null));
    expect(screen.queryByRole('group', { name: 'Bewegung in der Tiefe' })).toBeNull();
  });

  it('shows the sampled value and a typed number sets a key at the current frame', () => {
    render(<DepthPanel />);
    const field = screen.getByLabelText('Kippen') as HTMLInputElement;
    expect(field.value).toBe('0');
    fireEvent.change(field, { target: { value: '30' } });
    fireEvent.blur(field);
    expect(tiltKeys()).toEqual([{ frame: 0, value: 30, easing: 'linear' }]);
    expect((screen.getByLabelText('Kippen') as HTMLInputElement).value).toBe('30');
  });

  it('a slider drag is one undo step', () => {
    render(<DepthPanel />);
    const slider = screen.getByLabelText('Kippen Regler');
    const before = past();
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '10' } });
    fireEvent.change(slider, { target: { value: '25' } });
    fireEvent.pointerUp(slider);
    expect(tiltKeys()).toEqual([{ frame: 0, value: 25, easing: 'linear' }]);
    expect(past()).toBe(before + 1);
    act(() => editor().undo());
    expect(tiltKeys()).toEqual([]);
  });

  it('turn and depth have their own fields', () => {
    render(<DepthPanel />);
    fireEvent.change(screen.getByLabelText('Drehen'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Tiefe'), { target: { value: '-4' } });
    const track = selectActiveAnimation(editor())!.tracks.thigh_L;
    expect(track.turn![0].value).toBe(12);
    expect(track.depth![0].value).toBe(-4);
  });

  it('is disabled with a hint while the project is locked', () => {
    act(() => editor().setSettings({ depthLocked: true }));
    render(<DepthPanel />);
    expect((screen.getByLabelText('Kippen') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Kippen Regler') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('gesperrt');
  });
});

describe('depth lock button', () => {
  it('toggles settings.depthLocked as one undo step and keeps the keys', () => {
    editor().poseBone('thigh_L', { tilt: 20 });
    render(<CameraControls />);
    const button = screen.getByRole('button', { name: 'Tiefe sperren' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    const before = past();
    fireEvent.click(button);
    expect(editor().project.settings.depthLocked).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(past()).toBe(before + 1);
    expect(tiltKeys()).toHaveLength(1);
    fireEvent.click(button);
    expect(editor().project.settings.depthLocked).toBe(false);
    expect(tiltKeys()).toHaveLength(1);
  });
});
