import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { useEditor } from '../state/store';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onFocus' | 'onBlur' | 'onKeyDown'> & {
  value: string;
  /** Called with the typed text on every change that differs from `value`; return false to reject it. */
  onCommit: (text: string) => boolean | void;
  /** Blur the input after Enter, returning focus to the app (and its shortcuts). */
  blurOnEnter?: boolean;
};

/**
 * Input that applies every valid change as it is typed. All changes of one edit (focus to blur or
 * Enter) form one undo step; Escape reverts the edit. While focused the typed text is kept as is
 * (e.g. "1." or a rejected "-"), afterwards the field shows the stored value again.
 */
export function CommitInput({ value, onCommit, blurOnEnter, ...rest }: Props) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  /** Text when the current edit started, for Escape; null when no edit is open. */
  const editStart = useRef<string | null>(null);
  useEffect(() => {
    if (!focused.current && editStart.current === null) setText(value);
  }, [value]);

  const change = (next: string) => {
    setText(next);
    if (editStart.current === null) {
      editStart.current = value;
      useEditor.getState().beginEditGroup();
    }
    if (next !== value) onCommit(next);
  };
  const endEdit = (revert: boolean) => {
    const start = editStart.current;
    if (start === null) return;
    editStart.current = null;
    // Non-project values (view state) have no undo: put them back explicitly.
    if (revert && start !== value) onCommit(start);
    useEditor.getState().endEditGroup(revert);
  };
  useEffect(() => () => endEdit(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => change(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        endEdit(false);
        setText(value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          endEdit(false);
          setText(value);
          if (blurOnEnter) e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          const start = editStart.current;
          endEdit(true);
          if (start !== null) setText(start);
        }
      }}
    />
  );
}

/** Parses a finite number from user text, or null. */
export function parseNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
