import { useEffect, useRef } from 'react';
import { addListeners } from '../dom/listeners';
import { editor } from '../state/store';
import { CAMERA_KEY_STEP_DEG, ORBIT_FRONT, ORBIT_SIDE, ORBIT_TOP } from './constants';
import { isSpaceSensitiveTarget, isTextEntryTarget } from './keyboard';

/** Which focused elements keep a key for themselves. */
export type KeyGuard = 'none' | 'textEntry' | 'spaceSensitive';

export interface Shortcut {
  /** Default 'keydown'. */
  type?: 'keydown' | 'keyup';
  /** Physical key (`KeyboardEvent.code`), e.g. 'KeyQ', 'Space'. */
  code?: string;
  /** Logical key (`KeyboardEvent.key`, case-insensitive), e.g. 'z', 'Delete'. */
  key?: string;
  /** 'ctrl': Ctrl or Cmd held (Alt ignored); 'none': none of Ctrl / Cmd / Alt; omitted: modifiers ignored. */
  mods?: 'ctrl' | 'none';
  /** If set, Shift must be in this state. */
  shift?: boolean;
  /** Ignore auto-repeat events. */
  noRepeat?: boolean;
  guard: KeyGuard;
  /** Extra condition; when false the event is left alone (not prevented). */
  when?: () => boolean;
  run(e: KeyboardEvent): void;
  /** Default true. */
  preventDefault?: boolean;
}

const GUARDS: Record<KeyGuard, (t: EventTarget | null) => boolean> = {
  none: () => false,
  textEntry: isTextEntryTarget,
  spaceSensitive: isSpaceSensitiveTarget,
};

function matches(s: Shortcut, e: KeyboardEvent): boolean {
  if ((s.type ?? 'keydown') !== e.type) return false;
  if (s.code !== undefined && s.code !== e.code) return false;
  if (s.key !== undefined && s.key.toLowerCase() !== e.key?.toLowerCase()) return false;
  if (s.mods === 'ctrl' && !(e.ctrlKey || e.metaKey)) return false;
  if (s.mods === 'none' && (e.ctrlKey || e.metaKey || e.altKey)) return false;
  if (s.shift !== undefined && s.shift !== e.shiftKey) return false;
  if (s.noRepeat && e.repeat) return false;
  return true;
}

/** Runs the first shortcut of `table` that matches `e` and is not blocked; returns whether one ran. */
export function dispatchShortcut(table: readonly Shortcut[], e: KeyboardEvent): boolean {
  for (const s of table) {
    if (!matches(s, e) || GUARDS[s.guard](e.target) || (s.when && !s.when())) continue;
    s.run(e);
    if (s.preventDefault !== false) e.preventDefault();
    return true;
  }
  return false;
}

// Escape closes the most recently opened drawer / menu first.
const escapeStack: (() => void)[] = [];

/** Puts `close` on top of the Escape stack; returns a function that takes it off again. */
export function pushEscape(close: () => void): () => void {
  escapeStack.push(close);
  return () => {
    const i = escapeStack.lastIndexOf(close);
    if (i >= 0) escapeStack.splice(i, 1);
  };
}


/** The app-wide shortcuts. Entries are mutually exclusive; the first match wins. */
export const SHORTCUTS: readonly Shortcut[] = [
  { key: 'z', mods: 'ctrl', shift: false, guard: 'textEntry', run: () => editor().undo() },
  { key: 'z', mods: 'ctrl', shift: true, guard: 'textEntry', run: () => editor().redo() },
  { key: 'y', mods: 'ctrl', guard: 'textEntry', run: () => editor().redo() },
  // Q / E turn the camera (not while typing, not with modifiers, not during a drag).
  ...([['KeyQ', -1], ['KeyE', 1]] as const).map(
    ([code, sign]): Shortcut => ({
      code,
      mods: 'none',
      noRepeat: true,
      guard: 'textEntry',
      when: () => editor().transaction === null,
      run: () => editor().rotateCamera(sign * CAMERA_KEY_STEP_DEG),
    }),
  ),
  // A / D / W / S orbit the camera, 1 / 3 / 7 (digit row or numpad) jump to front / side / top,
  // M mirrors, H shows / hides the rig (same guards as Q / E).
  ...(
    [
      ['KeyA', () => editor().orbitBy(-CAMERA_KEY_STEP_DEG, 0)],
      ['KeyD', () => editor().orbitBy(CAMERA_KEY_STEP_DEG, 0)],
      ['KeyW', () => editor().orbitBy(0, CAMERA_KEY_STEP_DEG)],
      ['KeyS', () => editor().orbitBy(0, -CAMERA_KEY_STEP_DEG)],
      ...(['Digit', 'Numpad'] as const).flatMap((prefix) => [
        [`${prefix}1`, () => editor().setOrbit(ORBIT_FRONT.yaw, ORBIT_FRONT.pitch)] as const,
        [`${prefix}3`, () => editor().setOrbit(ORBIT_SIDE.yaw, ORBIT_SIDE.pitch)] as const,
        [`${prefix}7`, () => editor().setOrbit(ORBIT_TOP.yaw, ORBIT_TOP.pitch)] as const,
      ]),
      ['KeyM', () => editor().toggleMirror()],
      ['KeyH', () => editor().toggleRig()],
    ] as const
  ).map(
    ([code, run]): Shortcut => ({
      code,
      mods: 'none',
      noRepeat: true,
      guard: 'textEntry',
      when: () => editor().transaction === null,
      run,
    }),
  ),
  // Space held = viewport pan mode; a fresh press forgets an earlier pan.
  {
    code: 'Space',
    guard: 'spaceSensitive',
    run: (e) => {
      editor().setSpaceHeld(true);
      if (!e.repeat) editor().setSpacePanned(false);
    },
  },
  // Releasing Space always ends pan mode; it toggles playback unless a pan happened during the press.
  {
    type: 'keyup',
    code: 'Space',
    guard: 'none',
    preventDefault: false,
    run: (e) => {
      const s = editor();
      s.setSpaceHeld(false);
      if (isSpaceSensitiveTarget(e.target)) return;
      if (s.spacePanned) s.setSpacePanned(false);
      else s.setPlaying(!s.playing);
    },
  },
  {
    key: 'Escape',
    guard: 'none',
    preventDefault: false,
    when: () => escapeStack.length > 0,
    run: () => escapeStack[escapeStack.length - 1](),
  },
];

// Shortcuts registered by mounted components (e.g. Delete for the selected timeline key).
const registered = new Set<() => Shortcut>();

const activeShortcuts = (): Shortcut[] => [...SHORTCUTS, ...[...registered].map((get) => get())];

// Extra condition for all global shortcuts (the suite turns them off while Rigsprite is hidden or switching).
let gate: () => boolean = () => true;

/** Global shortcuts run only while `fn()` is true; returns a function that restores the default (always on). */
export function setShortcutGate(fn: () => boolean): () => void {
  gate = fn;
  return () => {
    if (gate === fn) gate = () => true;
  };
}

const onKey = (e: KeyboardEvent) => {
  if (!gate()) return;
  dispatchShortcut(activeShortcuts(), e);
};
const onBlur = () => editor().setSpaceHeld(false);

/** The one global keyboard listener (mount once, in App), active while `enabled`. Window blur releases Space. */
export function useGlobalShortcuts(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    return addListeners([
      [window, 'keydown', onKey],
      [window, 'keyup', onKey],
      [window, 'blur', onBlur],
    ]);
  }, [enabled]);
}

/** Registers a component shortcut while mounted; the latest `shortcut` value is used on each key event. */
export function useShortcut(shortcut: Shortcut): void {
  const ref = useRef(shortcut);
  ref.current = shortcut;
  useEffect(() => {
    const get = () => ref.current;
    registered.add(get);
    return () => {
      registered.delete(get);
    };
  }, []);
}

/** While `open`, Escape calls the latest `close` (topmost open drawer / menu first). */
export function useEscape(open: boolean, close: () => void): void {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => (open ? pushEscape(() => ref.current()) : undefined), [open]);
}
