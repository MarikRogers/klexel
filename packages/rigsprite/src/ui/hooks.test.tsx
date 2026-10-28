// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithShortcuts } from '../test/renderWithShortcuts';
import { useDismissable } from './useDismissable';
import { useMediaQuery } from './useMediaQuery';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  function Probe() {
    return <span data-testid="m">{String(useMediaQuery('(max-width: 10px)'))}</span>;
  }

  it('is false without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(<Probe />);
    expect(screen.getByTestId('m').textContent).toBe('false');
  });

  it('follows the media query and unsubscribes on unmount', () => {
    let listener: (() => void) | null = null;
    const mq = {
      matches: true,
      addEventListener: (_type: string, fn: () => void) => {
        listener = fn;
      },
      removeEventListener: () => {
        listener = null;
      },
    };
    const matchMedia = vi.fn(() => mq);
    vi.stubGlobal('matchMedia', matchMedia);
    const { unmount } = render(<Probe />);
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 10px)');
    expect(screen.getByTestId('m').textContent).toBe('true');
    mq.matches = false;
    act(() => listener!());
    expect(screen.getByTestId('m').textContent).toBe('false');
    unmount();
    expect(listener).toBeNull();
  });
});

describe('useDismissable', () => {
  function Menu() {
    const [open, setOpen] = useState(true);
    const ref = useRef<HTMLDivElement>(null);
    useDismissable(open, ref, () => setOpen(false));
    return (
      <div>
        <div ref={ref} data-testid="menu">
          {open ? 'open' : 'closed'}
        </div>
        <button onClick={() => setOpen(true)}>open it</button>
      </div>
    );
  }

  it('closes on Escape and on a pointer press outside, not inside', () => {
    renderWithShortcuts(<Menu />);
    const menu = screen.getByTestId('menu');
    fireEvent.pointerDown(menu);
    expect(menu.textContent).toBe('open');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(menu.textContent).toBe('closed');
    fireEvent.click(screen.getByRole('button'));
    expect(menu.textContent).toBe('open');
    fireEvent.pointerDown(document.body);
    expect(menu.textContent).toBe('closed');
  });
});
