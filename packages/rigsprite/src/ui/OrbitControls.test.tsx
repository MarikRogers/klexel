// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LAYER_SPACING } from '../core/defaults';
import { useEditor } from '../state/store';
import { OrbitControls } from './OrbitControls';

const s = () => useEditor.getState();
const past = () => useEditor.temporal.getState().pastStates.length;

beforeEach(() => {
  s().newProject('humanoid');
  useEditor.setState({ orbit: { yaw: 0, pitch: 0 }, layerSpacing: DEFAULT_LAYER_SPACING, showRig: true });
});
afterEach(cleanup);

describe('OrbitControls', () => {
  it('Vorne / Seite / Oben jump to the preset views without undo entries', () => {
    render(<OrbitControls />);
    const undo0 = past();
    fireEvent.click(screen.getByRole('button', { name: 'Seite' }));
    expect(s().orbit).toEqual({ yaw: 90, pitch: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Oben' }));
    expect(s().orbit).toEqual({ yaw: 0, pitch: 90 });
    fireEvent.click(screen.getByRole('button', { name: 'Vorne' }));
    expect(s().orbit).toEqual({ yaw: 0, pitch: 0 });
    expect(past()).toBe(undo0);
  });

  it('step buttons turn the orbit by 15° (pitch clamped at 90°)', () => {
    render(<OrbitControls />);
    fireEvent.click(screen.getByRole('button', { name: 'Orbit hoch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Orbit hoch' }));
    expect(s().orbit.pitch).toBe(30);
    fireEvent.click(screen.getByRole('button', { name: 'Orbit runter' }));
    expect(s().orbit.pitch).toBe(15);
    fireEvent.click(screen.getByRole('button', { name: 'Orbit rechts' }));
    expect(s().orbit.yaw).toBe(15);
    fireEvent.click(screen.getByRole('button', { name: 'Orbit links' }));
    fireEvent.click(screen.getByRole('button', { name: 'Orbit links' }));
    expect(s().orbit.yaw).toBe(-15);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole('button', { name: 'Orbit hoch' }));
    expect(s().orbit.pitch).toBe(90);
  });

  it('shows the current angles and names the keys in the button titles', () => {
    render(<OrbitControls />);
    act(() => s().setOrbit(-45, 30));
    expect(screen.getByTestId('orbit-angles').textContent).toContain('-45°');
    expect(screen.getByTestId('orbit-angles').textContent).toContain('30°');
    expect(screen.getByRole('button', { name: 'Seite' }).title).toContain('3');
    expect(screen.getByRole('button', { name: 'Orbit hoch' }).title).toContain('W');
  });

  it('the Ansicht button folds the panel away and back (open by default on desktop)', () => {
    render(<OrbitControls />);
    const toggle = screen.getByRole('button', { name: 'Ansicht' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Seite' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Seite' })).toBeTruthy();
  });

  it('shows the angles rounded to one decimal without touching the store', () => {
    useEditor.setState({ orbit: { yaw: -37.333333, pitch: 12.349 } });
    render(<OrbitControls />);
    expect(screen.getByTestId('orbit-angles').textContent).toBe('-37.3° / 12.3°');
    expect(s().orbit).toEqual({ yaw: -37.333333, pitch: 12.349 });
  });

  it('Ebenenabstand sets the layer spacing and rejects non-numbers', () => {
    render(<OrbitControls />);
    const input = screen.getByLabelText('Ebenenabstand') as HTMLInputElement;
    expect(input.value).toBe(String(DEFAULT_LAYER_SPACING));
    const undo0 = past();
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s().layerSpacing).toBe(20);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(s().layerSpacing).toBe(20);
    expect(input.value).toBe('20');
    expect(past()).toBe(undo0);
  });

  it('Rig anzeigen toggles the rig overlay', () => {
    render(<OrbitControls />);
    const button = screen.getByRole('button', { name: 'Rig anzeigen' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(useEditor.getState().showRig).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});
