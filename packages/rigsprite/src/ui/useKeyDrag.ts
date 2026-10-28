import { useEffect, useRef, useState } from 'react';
import { clamp, dist } from '../core/math';
import { selectActiveAnimation, useEditor } from '../state/store';
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX } from './constants';
import { capturePointer } from './pointer';

/** One timeline key: all channels of a bone at a frame. */
export interface KeyRef {
  boneId: string;
  frame: number;
}

/** Position of the easing menu (client coordinates) and the key it edits. */
export type KeyMenu = KeyRef & { x: number; y: number; longPress?: boolean };

export interface KeyDrag {
  pointerId: number;
  boneId: string;
  from: number;
  startX: number;
  startY: number;
  to: number;
}

interface KeyDragOptions {
  /** Frame cell width in px. */
  cell: number;
  /** A change (e.g. another animation) drops a running drag / long-press. */
  resetKey: unknown;
  onSelect(key: KeyRef): void;
  onMenu(menu: KeyMenu): void;
}

export interface KeyDragHandlers {
  /** The running drag once the key has left its frame (for display), else null. */
  drag: KeyDrag | null;
  onPointerDown(e: React.PointerEvent, key: KeyRef): void;
  onPointerMove(e: React.PointerEvent): void;
  onPointerEnd(e: React.PointerEvent): void;
  onContextMenu(e: React.MouseEvent, key: KeyRef): void;
}

/**
 * Dragging a timeline key horizontally moves all its channels (on release, as one change);
 * a touch / pen long-press opens the easing menu instead, like a right click does for the mouse.
 */
export function useKeyDrag({ cell, resetKey, onSelect, onMenu }: KeyDragOptions): KeyDragHandlers {
  const [drag, setDrag] = useState<KeyDrag | null>(null);
  const dragRef = useRef<KeyDrag | null>(null);
  const longPressRef = useRef<number | null>(null);

  const cancelLongPress = () => {
    if (longPressRef.current !== null) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };

  // Unmount or a reset: drop any running key drag / long-press.
  useEffect(() => {
    return () => {
      cancelLongPress();
      dragRef.current = null;
      setDrag(null);
    };
  }, [resetKey]);

  return {
    drag,

    onPointerDown(e, key) {
      if (e.button !== 0) return;
      e.stopPropagation();
      capturePointer(e.currentTarget, e.pointerId);
      onSelect(key);
      dragRef.current = { pointerId: e.pointerId, boneId: key.boneId, from: key.frame, startX: e.clientX, startY: e.clientY, to: key.frame };
      cancelLongPress();
      // Mouse keeps right-click for the menu; holding the button must not open it.
      if (e.pointerType === 'mouse') return;
      const { clientX: x, clientY: y } = e;
      // Long-press = touch replacement for the right-click easing menu; it ends the drag.
      longPressRef.current = window.setTimeout(() => {
        longPressRef.current = null;
        dragRef.current = null;
        setDrag(null);
        onMenu({ ...key, x, y, longPress: true });
      }, LONG_PRESS_MS);
    },

    onPointerMove(e) {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      if (dist({ x: e.clientX, y: e.clientY }, { x: d.startX, y: d.startY }) > LONG_PRESS_SLOP_PX) cancelLongPress();
      const length = selectActiveAnimation(useEditor.getState())?.length ?? 1;
      const to = clamp(d.from + Math.round((e.clientX - d.startX) / cell), 0, length);
      if (to !== d.to) {
        dragRef.current = { ...d, to };
        setDrag(dragRef.current);
      }
    },

    onPointerEnd(e) {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      cancelLongPress();
      dragRef.current = null;
      setDrag(null);
      if (e.type === 'pointerup' && d.to !== d.from) {
        useEditor.getState().moveKeys(d.boneId, d.from, d.to);
        onSelect({ boneId: d.boneId, frame: d.to });
      }
    },

    onContextMenu(e, key) {
      e.preventDefault();
      cancelLongPress();
      onSelect(key);
      onMenu({ ...key, x: e.clientX, y: e.clientY });
    },
  };
}
