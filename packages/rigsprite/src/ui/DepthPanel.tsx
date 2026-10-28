import { sampleAnimation, type Channel } from '../core/animation';
import { MAX_DEPTH_ANGLE_DEG } from '../core/defaults';
import { clamp } from '../core/math';
import { selectActiveAnimation, useEditor } from '../state/store';
import { CommitInput, parseNumber } from './CommitInput';

const MAX_DEPTH_PX = 100;

type DepthChannel = Extract<Channel, 'tilt' | 'turn' | 'depth'>;

const ROWS: { channel: DepthChannel; label: string; max: number; title: string }[] = [
  { channel: 'tilt', label: 'Kippen', max: MAX_DEPTH_ANGLE_DEG, title: 'Spitze des Bones zur Kamera hin (+) oder von ihr weg (−)' },
  { channel: 'turn', label: 'Drehen', max: MAX_DEPTH_ANGLE_DEG, title: 'Drehung um die Bone-Achse' },
  { channel: 'depth', label: 'Tiefe', max: MAX_DEPTH_PX, title: 'Verschiebung zur Kamera hin (+) oder von ihr weg (−)' },
];

/** The pose of the selected bone in depth: tilt, turn and depth at the current frame (animate mode only). */
export function DepthPanel() {
  const mode = useEditor((s) => s.mode);
  const boneId = useEditor((s) => s.selectedBoneId);
  const animation = useEditor((s) => selectActiveAnimation(s));
  const frame = useEditor((s) => s.frame);
  const locked = useEditor((s) => s.project.settings.depthLocked);
  if (mode !== 'animate' || !boneId || !animation) return null;

  const sampled = sampleAnimation(animation, frame)[boneId] ?? {};
  const set = (channel: DepthChannel, max: number, value: number) =>
    useEditor.getState().poseBone(boneId, { [channel]: clamp(value, -max, max) });

  return (
    <div aria-label="Bewegung in der Tiefe" role="group">
      <h3>Tiefe</h3>
      {ROWS.map(({ channel, label, max, title }) => {
        const value = sampled[channel] ?? 0;
        return (
          <div className="field depth-field" key={channel} title={title}>
            <span>{label}</span>
            <input
              type="range"
              aria-label={`${label} Regler`}
              min={-max}
              max={max}
              step={1}
              value={clamp(value, -max, max)}
              disabled={locked}
              onPointerDown={() => useEditor.getState().beginTransaction()}
              onChange={(e) => set(channel, max, Number(e.target.value))}
              onPointerUp={() => useEditor.getState().commitTransaction()}
              onPointerCancel={() => useEditor.getState().commitTransaction()}
              onBlur={() => useEditor.getState().commitTransaction()}
            />
            <CommitInput
              aria-label={label}
              type="number"
              value={String(Math.round(value * 100) / 100)}
              disabled={locked}
              onCommit={(text) => {
                const n = parseNumber(text);
                if (n === null) return false;
                set(channel, max, n);
              }}
            />
          </div>
        );
      })}
      {locked && (
        <span role="status" className="hint">
          Tiefe ist gesperrt – den Schalter „Tiefe sperren“ in der Kamera-Leiste lösen.
        </span>
      )}
    </div>
  );
}
