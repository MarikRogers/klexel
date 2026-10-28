import { useMemo, useState } from 'react';
import type { ReturnResult } from '@suite/shared';
import { animationFrameSize } from '../core/animationFrames';
import { errorMessage } from '../core/messages';
import { downscaleNearest, type ReturnOptions } from '../core/returnPlan';
import { renderAnimationFrames } from '../render/renderSheet';
import { useEditor } from '../state/store';
import { fpsHint, fromUiIndex, initialOptions, planFor, suggestionText, warningText } from './returnDialogLogic';
import { useSuite } from './suiteBridge';

type Fields = { scale: string; from: string; to: string };

const toFields = (o: ReturnOptions): Fields => ({ scale: String(o.scale), from: String(o.from + 1), to: String(o.to + 1) });
const toOptions = (f: Fields): ReturnOptions => {
  const scale = Number(f.scale);
  return { scale: f.scale.trim() === '' ? Number.NaN : scale, from: fromUiIndex(f.from), to: fromUiIndex(f.to) };
};

/**
 * „Nach Klexel": eine Animation als NEUES Klexel-Projekt anlegen (jede Rückgabe ein weiteres Projekt). Passt sie
 * nicht in die Grenzen von Klexel, bleibt „Anlegen" gesperrt, bis Maßstab oder Frame-Bereich passen (nie still
 * verkleinern oder abschneiden). render ist für Tests austauschbar (GL gibt es dort nicht).
 */
export function ReturnToKlexelDialog({
  onClose,
  render = renderAnimationFrames,
}: {
  onClose: () => void;
  render?: typeof renderAnimationFrames;
}) {
  const suite = useSuite();
  const project = useEditor((s) => s.project);
  const animations = project.animations;
  const [animationId, setAnimationId] = useState(() => animations[0]?.id ?? '');
  const size = useMemo(() => (animationId ? animationFrameSize(project, animationId) : null), [project, animationId]);
  const [fields, setFields] = useState<Fields>(() => toFields(initialOptions(size)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ReturnResult | null>(null);

  const opts = toOptions(fields);
  const plan = planFor(size, opts);
  const returnToKlexel = suite?.returnToKlexel;

  const pickAnimation = (id: string) => {
    setAnimationId(id);
    setFields(toFields(initialOptions(animationFrameSize(project, id))));
    setError(null);
  };

  const create = async () => {
    if (!plan?.ok || !returnToKlexel || !size) return;
    setBusy(true);
    setError(null);
    try {
      const res = await render(useEditor.getState().project, animationId, { from: opts.from, to: opts.to });
      if (!res.ok) throw new Error(res.error);
      const frames = res.frames.map((pixels) => ({
        name: '',
        pixels: opts.scale > 1 ? downscaleNearest(pixels, res.width, res.height, opts.scale) : pixels,
      }));
      const result = await returnToKlexel({
        name: res.name,
        width: Math.ceil(res.width / opts.scale),
        height: Math.ceil(res.height / opts.scale),
        fps: res.fps,
        frames,
        origin: { animationId },
      });
      setCreated(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const openInKlexel = async () => {
    if (!created || !suite?.openProject) return;
    setBusy(true);
    try {
      await suite.openProject(created.projectId);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => {
    setFields((f) => ({ ...f, [k]: e.target.value }));
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog return-dialog" role="dialog" aria-label="Nach Klexel">
        <h2>Nach Klexel</h2>
        <p className="hint">Legt die Animation als neues Klexel-Projekt an (je Frame ein Bild). Rigsprite bleibt offen.</p>
        {animations.length === 0 ? (
          <p role="status">Keine Animationen vorhanden.</p>
        ) : (
          <>
            <label>
              Animation{' '}
              <select value={animationId} disabled={busy} onChange={(e) => pickAnimation(e.target.value)}>
                {animations.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            {size && (
              <p className="return-size" data-testid="return-size">
                Frame-Größe {size.width}×{size.height} Pixel · {size.frameCount} Frames · {size.fps} fps
              </p>
            )}
            {size && fpsHint(size.fps) && (
              <p className="hint" data-testid="return-fps-hint">{fpsHint(size.fps)}</p>
            )}
            <div className="return-fields">
              <label>
                Maßstab 1/
                <input type="number" min={1} step={1} value={fields.scale} disabled={busy} aria-label="Maßstab (Teiler)" onChange={set('scale')} />
              </label>
              <label>
                Frames von
                <input type="number" min={1} step={1} value={fields.from} disabled={busy} aria-label="Erster Frame" onChange={set('from')} />
              </label>
              <label>
                bis
                <input type="number" min={1} step={1} value={fields.to} disabled={busy} aria-label="Letzter Frame" onChange={set('to')} />
              </label>
            </div>
            {plan?.ok && (
              <p role="status" className="return-plan">
                Ergebnis: {plan.width}×{plan.height} Pixel, {plan.frames} Frames
              </p>
            )}
            {plan && !plan.ok && size && (
              <div role="alert" className="return-warning">
                <p>{warningText(size, opts, plan)}</p>
                <p>Vorschlag: {suggestionText(plan.suggestion)}</p>
                <button disabled={busy} onClick={() => setFields(toFields(plan.suggestion))}>Vorschlag übernehmen</button>
              </div>
            )}
          </>
        )}
        {error && <p role="alert" className="error">{error}</p>}
        {created && (
          <p role="status" className="return-created">
            „{created.name}“ wurde als Klexel-Projekt angelegt.
          </p>
        )}
        <div className="dialog-actions">
          <button disabled={busy || !plan?.ok || !returnToKlexel} onClick={() => void create()}>
            {busy ? 'Wird angelegt …' : created ? 'Noch einmal anlegen' : 'Anlegen'}
          </button>
          {created && suite?.openProject && (
            <button disabled={busy} onClick={() => void openInKlexel()}>In Klexel öffnen</button>
          )}
          <button disabled={busy} onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
