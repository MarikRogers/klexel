// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnimation, keyedFrames, setKey } from '../core/animation';
import { useEditor } from '../state/store';
import { Profiler } from 'react';
import { Timeline } from './Timeline';

// Counts TrackRow renders (the timeline body must not re-render per playback frame).
const trackRowRenders = vi.hoisted(() => ({ n: 0 }));
vi.mock('./TrackRow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./TrackRow')>();
  return {
    TrackRow: (props: Parameters<typeof actual.TrackRow>[0]) => {
      trackRowRenders.n++;
      return actual.TrackRow(props);
    },
  };
});
import { renderWithShortcuts } from '../test/renderWithShortcuts';

function seed() {
  const s = useEditor.getState();
  s.newProject('humanoid');
  let anim = createAnimation('test', 12, 16, true);
  anim = setKey(anim, 'head', 'rotation', { frame: 0, value: 0, easing: 'linear' });
  anim = setKey(anim, 'head', 'rotation', { frame: 8, value: 10, easing: 'linear' });
  useEditor.setState((st) => ({ project: { ...st.project, animations: [anim] }, animationId: anim.id, frame: 0 }));
}

// jsdom has no PointerEvent (fireEvent would drop clientX/pointerId) and no pointer capture.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? '';
      }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
  }
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const touch = (init: object = {}) => ({ pointerId: 7, pointerType: 'touch', button: 0, ...init });
const headKeys = () => within(screen.getByTestId('track-head')).getAllByTestId('key');

beforeEach(seed);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Timeline', () => {
  it('shows one diamond per keyed frame in the bone row', () => {
    renderWithShortcuts(<Timeline />);
    const row = screen.getByTestId('track-head');
    expect(within(row).getAllByTestId('key')).toHaveLength(2);
  });

  it('clicking a frame cell sets the frame', () => {
    renderWithShortcuts(<Timeline />);
    fireEvent.click(screen.getByTestId('frame-5'));
    expect(useEditor.getState().frame).toBe(5);
  });

  it('Delete removes the keys of the selected diamond', () => {
    renderWithShortcuts(<Timeline />);
    const row = screen.getByTestId('track-head');
    const key = within(row).getAllByTestId('key')[1];
    fireEvent.pointerDown(key, touch());
    fireEvent.pointerUp(key, touch());
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(within(screen.getByTestId('track-head')).getAllByTestId('key')).toHaveLength(1);
  });

  it('shows the empty state for a stale animation id', () => {
    act(() => useEditor.setState({ animationId: 'gone' }));
    renderWithShortcuts(<Timeline />);
    expect(screen.getByRole('button', { name: '+ Neu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aus Template' })).toBeTruthy();
  });

  it('creates an animation from a template of the project rig', () => {
    renderWithShortcuts(<Timeline />);
    fireEvent.click(screen.getByRole('button', { name: 'Aus Template' }));
    fireEvent.click(screen.getByRole('button', { name: 'walk' }));
    const s = useEditor.getState();
    expect(s.project.animations).toHaveLength(2);
    expect(s.project.animations.find((a) => a.id === s.animationId)!.name).toBe('walk');
  });

  it('play button toggles playing', () => {
    act(() => useEditor.getState().setMode('animate'));
    renderWithShortcuts(<Timeline />);
    fireEvent.click(screen.getByRole('button', { name: 'Abspielen' }));
    expect(useEditor.getState().playing).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(useEditor.getState().playing).toBe(false);
  });

  describe('Space', () => {
    beforeEach(() => {
      useEditor.getState().setSpacePanned(false);
      act(() => useEditor.getState().setMode('animate'));
    });
    const key = (type: 'keyDown' | 'keyUp', init: object = {}) => fireEvent[type](window, { code: 'Space', ...init });

    it('toggles once on keydown + keyup', () => {
      renderWithShortcuts(<Timeline />);
      key('keyDown');
      expect(useEditor.getState().playing).toBe(false);
      key('keyUp');
      expect(useEditor.getState().playing).toBe(true);
    });
    it('ignores key repeats', () => {
      renderWithShortcuts(<Timeline />);
      key('keyDown');
      key('keyDown', { repeat: true });
      key('keyDown', { repeat: true });
      key('keyUp');
      expect(useEditor.getState().playing).toBe(true);
    });
    it('does not toggle when a pan happened during the press', () => {
      renderWithShortcuts(<Timeline />);
      key('keyDown');
      useEditor.getState().setSpacePanned(true);
      key('keyUp');
      expect(useEditor.getState().playing).toBe(false);
      key('keyDown');
      key('keyUp');
      expect(useEditor.getState().playing).toBe(true);
    });
    it('does not steal Space from a focused checkbox', () => {
      renderWithShortcuts(<Timeline />);
      const box = screen.getByRole('checkbox');
      fireEvent.keyDown(box, { code: 'Space' });
      fireEvent.keyUp(box, { code: 'Space' });
      expect(useEditor.getState().playing).toBe(false);
    });
  });

  it('cannot play in setup mode or without an animation, and leaving animate mode stops playback', () => {
    useEditor.getState().setPlaying(true);
    expect(useEditor.getState().playing).toBe(false);
    act(() => useEditor.getState().setMode('animate'));
    useEditor.getState().setPlaying(true);
    expect(useEditor.getState().playing).toBe(true);
    act(() => useEditor.getState().setMode('setup'));
    expect(useEditor.getState().playing).toBe(false);
    act(() => {
      useEditor.getState().setMode('animate');
      useEditor.setState({ animationId: 'gone' });
    });
    useEditor.getState().setPlaying(true);
    expect(useEditor.getState().playing).toBe(false);
  });

  it('template menu closes on Escape and on outside click', () => {
    renderWithShortcuts(<Timeline />);
    fireEvent.click(screen.getByRole('button', { name: 'Aus Template' }));
    expect(screen.queryByRole('button', { name: 'walk' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'walk' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aus Template' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('button', { name: 'walk' })).toBeNull();
  });

  it('animation name, fps and length apply while typing, one undo step per field', () => {
    renderWithShortcuts(<Timeline />);
    const anim = () => useEditor.getState().project.animations[0];
    const pastBefore = useEditor.temporal.getState().pastStates.length;
    const fps = screen.getByLabelText('fps');
    fireEvent.change(fps, { target: { value: '2' } });
    expect(anim().fps).toBe(2);
    fireEvent.change(fps, { target: { value: '24' } });
    expect(anim().fps).toBe(24);
    fireEvent.blur(fps);
    expect(anim().fps).toBe(24);
    const length = screen.getByLabelText('Länge');
    fireEvent.change(length, { target: { value: '3' } });
    fireEvent.change(length, { target: { value: '32' } });
    fireEvent.keyDown(length, { key: 'Enter' });
    expect(anim().length).toBe(32);
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'r' } });
    expect(anim().name).toBe('r');
    fireEvent.change(name, { target: { value: 'run' } });
    fireEvent.blur(name);
    expect(anim().name).toBe('run');
    expect(useEditor.temporal.getState().pastStates.length).toBe(pastBefore + 3);
  });

  describe('touch', () => {
    it('dragging a diamond moves the key', () => {
      renderWithShortcuts(<Timeline />);
      const key = headKeys()[1];
      fireEvent.pointerDown(key, touch({ clientX: 200 }));
      fireEvent.pointerMove(key, touch({ clientX: 200 + 3 * 14 }));
      fireEvent.pointerUp(key, touch({ clientX: 200 + 3 * 14 }));
      expect(headKeys().map((k) => k.dataset.frame)).toEqual(['0', '11']);
      expect(keyedFrames(useEditor.getState().project.animations[0], 'head')).toEqual([0, 11]);
    });

    it('long-press on a diamond opens the easing menu', () => {
      vi.useFakeTimers();
      renderWithShortcuts(<Timeline />);
      const key = headKeys()[1];
      fireEvent.pointerDown(key, touch({ clientX: 100, clientY: 50 }));
      act(() => vi.advanceTimersByTime(499));
      expect(screen.queryByRole('menu')).toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.getByRole('menu')).toBeTruthy();
      fireEvent.pointerUp(key, touch({ clientX: 100, clientY: 50 }));
      expect(headKeys().map((k) => k.dataset.frame)).toEqual(['0', '8']);
      fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Stufe' }), touch());
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stufe' }));
      expect(useEditor.getState().project.animations[0].tracks.head.rotation![1].easing).toBe('step');
    });

    it('keeps the easing menu open through the release of a long-press, then a tap applies an easing', () => {
      vi.useFakeTimers();
      renderWithShortcuts(<Timeline />);
      const key = headKeys()[1];
      fireEvent.pointerDown(key, touch({ clientX: 100, clientY: 50 }));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByRole('menu')).toBeTruthy();
      fireEvent.pointerUp(key, touch({ clientX: 100, clientY: 50 }));
      // compatibility events after the touch, on the key and on whatever sits under the finger
      for (const el of [key, screen.getByRole('menu')]) {
        fireEvent.mouseDown(el);
        fireEvent.mouseUp(el);
        fireEvent.click(el);
      }
      expect(screen.getByRole('menu')).toBeTruthy();
      fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Stufe' }), touch());
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stufe' }));
      expect(useEditor.getState().project.animations[0].tracks.head.rotation![1].easing).toBe('step');
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('moving more than 8 px cancels the long-press', () => {
      vi.useFakeTimers();
      renderWithShortcuts(<Timeline />);
      const key = headKeys()[1];
      fireEvent.pointerDown(key, touch({ clientX: 100, clientY: 50 }));
      fireEvent.pointerMove(key, touch({ clientX: 100, clientY: 59 }));
      act(() => vi.advanceTimersByTime(600));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('"Key löschen" removes the selected key', () => {
      renderWithShortcuts(<Timeline />);
      expect(screen.queryByRole('button', { name: 'Key löschen' })).toBeNull();
      const key = headKeys()[1];
      fireEvent.pointerDown(key, touch());
      fireEvent.pointerUp(key, touch());
      fireEvent.click(screen.getByRole('button', { name: 'Key löschen' }));
      expect(headKeys()).toHaveLength(1);
      expect(screen.queryByRole('button', { name: 'Key löschen' })).toBeNull();
    });

    it('dragging over the ruler scrubs continuously', () => {
      renderWithShortcuts(<Timeline />);
      const ruler = screen.getByTestId('ruler');
      fireEvent.pointerDown(ruler, touch({ clientX: 3 * 14 + 2 }));
      expect(useEditor.getState().frame).toBe(3);
      fireEvent.pointerMove(ruler, touch({ clientX: 7 * 14 + 2 }));
      expect(useEditor.getState().frame).toBe(7);
      fireEvent.pointerMove(ruler, touch({ clientX: 999 }));
      expect(useEditor.getState().frame).toBe(15);
      fireEvent.pointerUp(ruler, touch({ clientX: 999 }));
      fireEvent.pointerMove(ruler, touch({ clientX: 2 }));
      expect(useEditor.getState().frame).toBe(15);
    });

    it('holding the mouse does not open the easing menu', () => {
      vi.useFakeTimers();
      renderWithShortcuts(<Timeline />);
      const key = headKeys()[1];
      fireEvent.pointerDown(key, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 50 });
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('switching the animation drops a running key drag', () => {
      renderWithShortcuts(<Timeline />);
      const key = headKeys()[1];
      fireEvent.pointerDown(key, touch({ clientX: 200 }));
      fireEvent.pointerMove(key, touch({ clientX: 200 + 3 * 14 }));
      const id = useEditor.getState().animationId;
      act(() => useEditor.getState().setAnimation(null));
      act(() => useEditor.getState().setAnimation(id));
      fireEvent.pointerUp(headKeys()[1], touch({ clientX: 200 + 3 * 14 }));
      expect(keyedFrames(useEditor.getState().project.animations[0], 'head')).toEqual([0, 8]);
    });

    it('uses 24 px frame cells on phones', () => {
      const mm = vi.fn((q: string) => ({ matches: q.includes('max-width'), media: q, addEventListener() {}, removeEventListener() {} }));
      vi.stubGlobal('matchMedia', mm);
      try {
        renderWithShortcuts(<Timeline />);
        expect(screen.getByTestId('frame-5').style.left).toBe('120px');
        expect(screen.getByTestId('frame-5').style.width).toBe('24px');
        const ruler = screen.getByTestId('ruler');
        fireEvent.pointerDown(ruler, touch({ clientX: 3 * 24 + 2 }));
        expect(useEditor.getState().frame).toBe(3);
        fireEvent.pointerUp(ruler, touch());
        const key = headKeys()[1];
        fireEvent.pointerDown(key, touch({ clientX: 200 }));
        fireEvent.pointerMove(key, touch({ clientX: 200 + 2 * 24 }));
        fireEvent.pointerUp(key, touch({ clientX: 200 + 2 * 24 }));
        expect(keyedFrames(useEditor.getState().project.animations[0], 'head')).toEqual([0, 10]);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});

describe('Timeline subscriptions', () => {
  it('does not re-render for part, camera or view changes', () => {
    let renders = 0;
    render(
      <Profiler id="timeline" onRender={() => renders++}>
        <Timeline />
      </Profiler>,
    );
    const before = renders;
    act(() => {
      useEditor.getState().setCameraRotation(90);
      useEditor.getState().setView({ x: 5, y: 5, zoom: 2 });
      useEditor.getState().setProjectName('anders');
    });
    expect(renders).toBe(before);
    act(() => useEditor.getState().setFrame(3));
    expect(renders).toBeGreaterThan(before);
  });

  it('a frame change moves the playheads without re-rendering the track rows', () => {
    renderWithShortcuts(<Timeline />);
    const rows = trackRowRenders.n;
    act(() => useEditor.getState().setFrame(5));
    expect(trackRowRenders.n).toBe(rows);
    const heads = document.querySelectorAll<HTMLElement>('.tl-playhead');
    expect(heads.length).toBe(useEditor.getState().project.rig.bones.length + 1);
    for (const h of heads) expect(h.style.left).toBe(`${5 * 14 + 7}px`);
    expect(screen.getByTestId('frame-5').className).toBe('tl-frame current');
  });

  it('sets the cell width as --cell on the timeline root', () => {
    const { container } = renderWithShortcuts(<Timeline />);
    expect((container.querySelector('.timeline-inner') as HTMLElement).style.getPropertyValue('--cell')).toBe('14px');
  });
});
