import { useEffect, useRef, type RefObject } from 'react';
import { useEscape } from './shortcuts';

/** While `open`, Escape or a pointer press outside `ref` calls `close` (popup menus). */
export function useDismissable(open: boolean, ref: RefObject<Element>, close: () => void): void {
  useEscape(open, close);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current();
    };
    // Capture: a target that stops pointerdown propagation (timeline keys) must still dismiss.
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, ref]);
}
