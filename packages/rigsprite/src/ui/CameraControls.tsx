import { useEditor } from '../state/store';
import { CommitInput, parseNumber } from './CommitInput';
import { CAMERA_BUTTON_STEP_DEG, CAMERA_KEY_STEP_DEG } from './constants';

const editor = () => useEditor.getState();

/**
 * Camera roll field with ±90° buttons, mirror toggle and reset (Q / E roll and M mirror are global
 * shortcuts; the orbit has its own panel in the viewport, see OrbitControls).
 */
export function CameraControls() {
  const cameraRotation = useEditor((s) => s.project.settings.cameraRotation);
  const mirrored = useEditor((s) => s.project.settings.mirror);
  const orbitYaw = useEditor((s) => s.orbit.yaw);
  const orbitPitch = useEditor((s) => s.orbit.pitch);
  return (
    <div className="tb-group">
      <label>
        Kamera{' '}
        <CommitInput
          aria-label="Kamera"
          type="number"
          step={CAMERA_KEY_STEP_DEG}
          style={{ width: '3.5em' }}
          value={String(cameraRotation)}
          onCommit={(text) => {
            const n = parseNumber(text);
            if (n === null) return false;
            editor().setCameraRotation(n);
          }}
        />
        °
      </label>
      <button
        onClick={() => editor().rotateCamera(-CAMERA_BUTTON_STEP_DEG)}
        aria-label="⟲ 90°"
        title="Kamera 90° gegen den Uhrzeigersinn drehen (Q: −15°)"
      >
        ⟲
      </button>
      <button
        onClick={() => editor().rotateCamera(CAMERA_BUTTON_STEP_DEG)}
        aria-label="⟳ 90°"
        title="Kamera 90° im Uhrzeigersinn drehen (E: +15°)"
      >
        ⟳
      </button>
      <button onClick={() => editor().toggleMirror()} aria-pressed={mirrored} title="Ansicht horizontal spiegeln (M)">
        Spiegeln
      </button>
      <button
        onClick={() => editor().resetCamera()}
        disabled={cameraRotation === 0 && orbitYaw === 0 && orbitPitch === 0}
        aria-label="Kamera zurücksetzen"
        title="Kamera zurücksetzen (Drehung und Orbit; Spiegeln bleibt)"
      >
        ⌂
      </button>
    </div>
  );
}
