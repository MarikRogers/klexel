import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Bone } from '../core/rig';
import { selectActiveAnimation, useEditor } from '../state/store';
import { CELL_DESKTOP, CELL_PHONE, PHONE_QUERY } from './constants';
import { EasingMenu } from './EasingMenu';
import { startPlayback } from './playback';
import { Ruler } from './Ruler';
import { useShortcut } from './shortcuts';
import { TimelineHeader } from './TimelineHeader';
import { TrackRow } from './TrackRow';
import { useKeyDrag, type KeyMenu, type KeyRef } from './useKeyDrag';
import { useMediaQuery } from './useMediaQuery';

/** Bones in tree order (parents before their children). */
function treeOrder(bones: Bone[]): Bone[] {
  const out: Bone[] = [];
  const visit = (parentId: string | null) => {
    for (const b of bones.filter((x) => x.parentId === parentId)) {
      out.push(b);
      visit(b.id);
    }
  };
  visit(null);
  return out;
}

/** Runs the playback clock while `playing`. */
function usePlaybackClock() {
  const playing = useEditor((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    return startPlayback();
  }, [playing]);
}

export function Timeline() {
  // Narrow slices: part drags, camera / settings changes and playback frames do not re-render the
  // timeline body (the ruler and the playheads follow `frame` on their own).
  const rigBones = useEditor((s) => s.project.rig.bones);
  const animationId = useEditor((s) => s.animationId);
  const anim = useEditor(selectActiveAnimation);
  const selectedBoneId = useEditor((s) => s.selectedBoneId);
  const bones = useMemo(() => treeOrder(rigBones), [rigBones]);
  const cell = useMediaQuery(PHONE_QUERY) ? CELL_PHONE : CELL_DESKTOP;

  const [selectedKey, setSelectedKey] = useState<KeyRef | null>(null);
  const [menu, setMenu] = useState<KeyMenu | null>(null);
  const keyDrag = useKeyDrag({ cell, resetKey: animationId, onSelect: setSelectedKey, onMenu: setMenu });
  usePlaybackClock();

  const deleteSelectedKey = () => {
    if (!selectedKey) return;
    useEditor.getState().removeKeysAt(selectedKey.boneId, selectedKey.frame);
    setSelectedKey(null);
  };
  useShortcut({
    key: 'Delete',
    guard: 'spaceSensitive',
    preventDefault: false,
    when: () => selectedKey !== null,
    run: deleteSelectedKey,
  });

  // One source for the cell width: CSS sizes the key hit boxes from --cell.
  const rootStyle = { '--cell': `${cell}px` } as CSSProperties;
  const header = <TimelineHeader hasSelectedKey={selectedKey !== null} onDeleteKey={deleteSelectedKey} />;

  if (!anim) {
    return (
      <div className="timeline-inner" style={rootStyle}>
        {header}
        <div className="hint timeline-empty">Keine Animation. Lege eine neue an oder starte von einem Template.</div>
      </div>
    );
  }

  const width = (anim.length + 1) * cell;
  return (
    <div className="timeline-inner" style={rootStyle}>
      {header}
      <div className="timeline-grid">
        <div className="timeline-scroll">
          <Ruler length={anim.length} cell={cell} width={width} />
          {bones.map((bone) => (
            <TrackRow
              key={bone.id}
              bone={bone}
              anim={anim}
              selected={selectedBoneId === bone.id}
              selectedKey={selectedKey}
              cell={cell}
              width={width}
              keyDrag={keyDrag}
            />
          ))}
        </div>
      </div>
      {menu && <EasingMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
