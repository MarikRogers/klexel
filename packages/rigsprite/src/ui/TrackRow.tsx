import { keyedFrames, type Animation } from '../core/animation';
import type { Bone } from '../core/rig';
import { editor, useEditor } from '../state/store';
import { NAME_COLUMN_WIDTH } from './constants';
import { Playhead } from './Playhead';
import type { KeyDragHandlers, KeyRef } from './useKeyDrag';

interface TrackRowProps {
  bone: Bone;
  anim: Animation;
  /** The bone is selected. */
  selected: boolean;
  selectedKey: KeyRef | null;
  cell: number;
  /** Width of the cell area in px. */
  width: number;
  keyDrag: KeyDragHandlers;
}


/** One bone: its name and a diamond per keyed frame (drag to move, right click / long-press for easing). */
export function TrackRow({ bone, anim, selected, selectedKey, cell, width, keyDrag }: TrackRowProps) {
  const { drag } = keyDrag;
  return (
    <div
      className={selected ? 'tl-row selected' : 'tl-row'}
      data-testid={`track-${bone.name}`}
      style={{ width: NAME_COLUMN_WIDTH + width }}
    >
      <div className="tl-name" onClick={() => editor().select(bone.id)}>
        {bone.name}
      </div>
      <div
        className="tl-cells"
        style={{ width }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          editor().setFrame(Math.floor((e.clientX - rect.left) / cell));
        }}
      >
        {keyedFrames(anim, bone.id).map((f) => {
          const key: KeyRef = { boneId: bone.id, frame: f };
          const dragging = drag && drag.boneId === bone.id && drag.from === f;
          const shown = dragging ? drag.to : f;
          const isSelected = selectedKey?.boneId === bone.id && selectedKey.frame === f;
          return (
            <div
              key={f}
              data-testid="key"
              data-frame={shown}
              className={isSelected ? 'tl-key selected' : 'tl-key'}
              style={{ left: shown * cell + cell / 2 }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => keyDrag.onPointerDown(e, key)}
              onPointerMove={keyDrag.onPointerMove}
              onPointerUp={keyDrag.onPointerEnd}
              onPointerCancel={keyDrag.onPointerEnd}
              onContextMenu={(e) => keyDrag.onContextMenu(e, key)}
            />
          );
        })}
        <Playhead cell={cell} />
      </div>
    </div>
  );
}
