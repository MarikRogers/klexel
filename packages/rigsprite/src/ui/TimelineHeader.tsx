import { useRef, useState } from 'react';
import { MAX_FPS, MIN_ANIMATION_LENGTH, MIN_FPS } from '../core/defaults';
import { ANIMATION_TEMPLATES } from '../core/templates/animations';
import { editor, selectActiveAnimation, useEditor } from '../state/store';
import { CommitInput, parseNumber } from './CommitInput';
import { useDismissable } from './useDismissable';


/** "Aus Template" button with its dropdown of the animation templates for the project rig. */
function TemplateMenu() {
  const rigTemplateId = useEditor((s) => s.project.rigTemplateId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useDismissable(open, ref, () => setOpen(false));
  const templates = ANIMATION_TEMPLATES.filter((t) => t.rigTemplateId === rigTemplateId);
  return (
    <span className="template-wrap" ref={ref}>
      <button aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Aus Template
      </button>
      {open && (
        <ul className="template-menu">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => {
                  editor().addAnimationFromTemplate(t.id);
                  setOpen(false);
                }}
              >
                {t.name}
              </button>
            </li>
          ))}
          {templates.length === 0 && <li className="hint">Keine Templates</li>}
        </ul>
      )}
    </span>
  );
}

interface TimelineHeaderProps {
  /** Shows "Key löschen" when a key is selected. */
  hasSelectedKey: boolean;
  onDeleteKey(): void;
}

/** Animation picker, new / template, playback and the active animation's settings. */
export function TimelineHeader({ hasSelectedKey, onDeleteKey }: TimelineHeaderProps) {
  const animations = useEditor((s) => s.project.animations);
  const anim = useEditor(selectActiveAnimation);
  const playing = useEditor((s) => s.playing);
  const mode = useEditor((s) => s.mode);

  return (
    <div className="timeline-head">
      <select aria-label="Animation" value={anim ? anim.id : ''} onChange={(e) => editor().setAnimation(e.target.value || null)}>
        {!anim && <option value="">– keine –</option>}
        {animations.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <button onClick={() => editor().addAnimation(`Animation ${animations.length + 1}`)}>+ Neu</button>
      <TemplateMenu />
      {anim && (
        <>
          <button disabled={mode !== 'animate'} onClick={() => editor().setPlaying(!playing)}>
            {playing ? 'Pause' : 'Abspielen'}
          </button>
          <label>
            Name{' '}
            <CommitInput
              type="text"
              value={anim.name}
              onCommit={(text) => {
                if (text.trim() === '') return false;
                editor().updateAnimation(anim.id, { name: text });
              }}
            />
          </label>
          <label>
            fps{' '}
            <CommitInput
              type="number"
              min={MIN_FPS}
              max={MAX_FPS}
              value={String(anim.fps)}
              onCommit={(text) => {
                const v = Math.round(parseNumber(text) ?? 0);
                if (v < MIN_FPS) return false;
                editor().updateAnimation(anim.id, { fps: v });
              }}
            />
          </label>
          <label>
            Länge{' '}
            <CommitInput
              type="number"
              min={MIN_ANIMATION_LENGTH}
              value={String(anim.length)}
              onCommit={(text) => {
                const v = Math.round(parseNumber(text) ?? 0);
                if (v < MIN_ANIMATION_LENGTH) return false;
                editor().updateAnimation(anim.id, { length: v });
              }}
            />
          </label>
          <label>
            <input type="checkbox" checked={anim.loop} onChange={(e) => editor().updateAnimation(anim.id, { loop: e.target.checked })} /> Loop
          </label>
          <button onClick={() => editor().removeAnimation(anim.id)}>Animation löschen</button>
          {hasSelectedKey && <button onClick={onDeleteKey}>Key löschen</button>}
        </>
      )}
    </div>
  );
}
