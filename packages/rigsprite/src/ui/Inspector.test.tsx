// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../state/store';
import { Inspector } from './Inspector';

const torso = () => useEditor.getState().project.rig.bones.find((b) => b.id === 'torso')!;
const boneGroup = () => screen.getByRole('group', { name: 'Bone-Inspector' });

beforeEach(() => {
  useEditor.getState().newProject('humanoid');
  useEditor.getState().select('torso');
});
afterEach(cleanup);

describe('Inspector', () => {
  it('number fields apply while typing, as one undo step per edit', () => {
    render(<Inspector />);
    const input = within(boneGroup()).getByLabelText('x');
    const pastBefore = useEditor.temporal.getState().pastStates.length;
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(torso().x).toBe(12);
    fireEvent.change(input, { target: { value: '123' } });
    expect(torso().x).toBe(123);
    fireEvent.blur(input);
    expect(torso().x).toBe(123);
    expect(useEditor.temporal.getState().pastStates.length).toBe(pastBefore + 1);
  });

  it('Enter ends the edit and Escape reverts it', () => {
    render(<Inspector />);
    const input = within(boneGroup()).getByLabelText('Länge') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '55' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(torso().length).toBe(55);
    const pastBefore = useEditor.temporal.getState().pastStates.length;
    fireEvent.change(input, { target: { value: '99' } });
    expect(torso().length).toBe(99);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(torso().length).toBe(55);
    expect(useEditor.temporal.getState().pastStates.length).toBe(pastBefore);
    fireEvent.blur(input);
    expect(torso().length).toBe(55);
    expect(input.value).toBe('55');
  });

  it('a duplicate bone name is reverted with a hint', () => {
    render(<Inspector />);
    const input = within(boneGroup()).getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'head' } });
    fireEvent.blur(input);
    expect(torso().name).toBe('torso');
    expect(input.value).toBe('torso');
    expect(screen.getByRole('status').textContent).toBe('Name bereits vergeben');
    fireEvent.change(input, { target: { value: 'chest' } });
    fireEvent.blur(input);
    expect(torso().name).toBe('chest');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Inspector subscriptions', () => {
  it('does not re-render for project changes outside the selection', () => {
    let renders = 0;
    render(
      <Profiler id="inspector" onRender={() => renders++}>
        <Inspector />
      </Profiler>,
    );
    const before = renders;
    act(() => {
      useEditor.getState().updateBone('head', { x: 7 });
      useEditor.getState().setCameraRotation(90);
      useEditor.getState().setView({ x: 5, y: 5, zoom: 2 });
    });
    expect(renders).toBe(before);
    act(() => useEditor.getState().updateBone('torso', { x: 7 }));
    expect(renders).toBeGreaterThan(before);
    expect((within(boneGroup()).getByLabelText('x') as HTMLInputElement).value).toBe('7');
  });
});
