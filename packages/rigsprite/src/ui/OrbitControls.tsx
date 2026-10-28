import { useState } from 'react';
import { useEditor } from '../state/store';
import { CommitInput, parseNumber } from './CommitInput';
import { CAMERA_KEY_STEP_DEG, ORBIT_FRONT, ORBIT_SIDE, ORBIT_TOP, PHONE_QUERY } from './constants';
import { useMediaQuery } from './useMediaQuery';

const editor = () => useEditor.getState();

/** Display-only rounding to one decimal (the store keeps the exact angle). */
export const formatAngle = (deg: number) => Math.round(deg * 10) / 10;

const PRESETS = [
  { label: 'Vorne', key: '1', orbit: ORBIT_FRONT, title: 'Vorderansicht' },
  {
    label: 'Seite',
    key: '3',
    orbit: ORBIT_SIDE,
    title: 'Seitenansicht (Gieren 90°)',
  },
  {
    label: 'Oben',
    key: '7',
    orbit: ORBIT_TOP,
    title: 'Ansicht von oben (Nicken 90°)',
  },
] as const;

const STEPS = [
  {
    label: 'Orbit links',
    icon: '◀',
    key: 'A',
    yaw: -CAMERA_KEY_STEP_DEG,
    pitch: 0,
  },
  {
    label: 'Orbit hoch',
    icon: '▲',
    key: 'W',
    yaw: 0,
    pitch: CAMERA_KEY_STEP_DEG,
  },
  {
    label: 'Orbit runter',
    icon: '▼',
    key: 'S',
    yaw: 0,
    pitch: -CAMERA_KEY_STEP_DEG,
  },
  {
    label: 'Orbit rechts',
    icon: '▶',
    key: 'D',
    yaw: CAMERA_KEY_STEP_DEG,
    pitch: 0,
  },
] as const;

/**
 * Floating "Ansicht" panel in the viewport's top right corner: orbit presets and steps, the current
 * angles and the layer spacing (all view state, no undo). Right-drag in the viewport orbits too.
 * The "Ansicht" button folds it away; folded by default on phones, where it would cover the rig.
 */
export function OrbitControls() {
  const yaw = useEditor((s) => s.orbit.yaw);
  const pitch = useEditor((s) => s.orbit.pitch);
  const layerSpacing = useEditor((s) => s.layerSpacing);
  const showRig = useEditor((s) => s.showRig);
  const phone = useMediaQuery(PHONE_QUERY);
  // null: not toggled yet, follow the layout default
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? !phone;
  return (
    <div className="orbit-panel" role="group" aria-label="Ansicht">
      <button
        className="orbit-toggle"
        onClick={() => setOpen(!expanded)}
        aria-label="Ansicht"
        aria-expanded={expanded}
        title="Ansicht-Steuerung ein- / ausblenden (Orbit: rechte Maustaste ziehen, A / D / W / S, 1 / 3 / 7)"
      >
        Ansicht {expanded ? '▴' : '▾'}
      </button>
      {expanded && (
        <>
          <div className="orbit-row">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => editor().setOrbit(p.orbit.yaw, p.orbit.pitch)}
                aria-pressed={yaw === p.orbit.yaw && pitch === p.orbit.pitch}
                title={`${p.title} (${p.key})`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="orbit-row">
            {STEPS.map((s) => (
              <button
                key={s.label}
                onClick={() => editor().orbitBy(s.yaw, s.pitch)}
                aria-label={s.label}
                title={`${s.label} um ${CAMERA_KEY_STEP_DEG}° (${s.key}; rechte Maustaste ziehen)`}
              >
                {s.icon}
              </button>
            ))}
            <span className="orbit-angles" data-testid="orbit-angles" title="Gieren / Nicken">
              {formatAngle(yaw)}° / {formatAngle(pitch)}°
            </span>
          </div>
          <label className="orbit-row" title="Abstand der Sprite-Ebenen in der gedrehten Ansicht (px pro z-Stufe)">
            Ebenen{' '}
            <CommitInput
              aria-label="Ebenenabstand"
              type="number"
              min={0}
              style={{ width: '3.5em' }}
              value={String(layerSpacing)}
              onCommit={(text) => {
                const n = parseNumber(text);
                if (n === null) return false;
                editor().setLayerSpacing(n);
              }}
            />
            px
          </label>
          <div className="orbit-row">
            <button
              onClick={() => editor().toggleRig()}
              aria-pressed={showRig}
              title="Knochen ein- / ausblenden, ausgeblendet sind nur die Sprites zu sehen (H)"
            >
              Rig anzeigen
            </button>
          </div>
        </>
      )}
    </div>
  );
}
