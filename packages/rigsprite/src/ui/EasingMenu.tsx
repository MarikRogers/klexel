import { useRef } from 'react';
import { EASINGS, type Easing } from '../core/animation';
import { useEditor } from '../state/store';
import type { KeyMenu } from './useKeyDrag';
import { useDismissable } from './useDismissable';

const EASING_LABELS: Record<Easing, string> = { linear: 'Linear', step: 'Stufe', easeInOut: 'Weich' };

/**
 * Easing choice for one timeline key, at the click / long-press position. Closes on Escape or a
 * press outside. A long-press opens it under the finger, so the mouse compatibility events
 * (mousedown / click) that follow the release land on the menu: items only react once a fresh
 * press has started on the menu itself.
 */
export function EasingMenu({ menu, onClose }: { menu: KeyMenu; onClose: () => void }) {
  const ref = useRef<HTMLUListElement>(null);
  const armed = useRef(!menu.longPress);
  useDismissable(true, ref, onClose);
  return (
    <ul
      ref={ref}
      className="easing-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={() => {
        armed.current = true;
      }}
    >
      {EASINGS.map((id) => (
        <li key={id}>
          <button
            role="menuitem"
            onClick={() => {
              if (!armed.current) return;
              useEditor.getState().setKeyEasing(menu.boneId, menu.frame, id);
              onClose();
            }}
          >
            {EASING_LABELS[id]}
          </button>
        </li>
      ))}
    </ul>
  );
}
