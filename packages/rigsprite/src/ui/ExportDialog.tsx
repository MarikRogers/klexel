import { useEffect, useState } from 'react';
import { sanitizeFileName, type ExportOptions } from '../core/export';
import { NO_ANIMATION_SELECTED } from '../core/messages';
import { renderSpritesheet } from '../render/renderSheet';
import { useEditor } from '../state/store';
import { download } from '../dom/download';
import { ReturnToKlexelDialog } from './ReturnToKlexelDialog';
import { useSuite } from './suiteBridge';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  // The list shows only the animations; the full project is read when rendering.
  const animations = useEditor((s) => s.project.animations);
  const [selected, setSelected] = useState<string[]>(() => animations.map((a) => a.id));
  const [scale, setScale] = useState<ExportOptions['scale']>(1);
  const [padding, setPadding] = useState(2);
  const [maxColumns, setMaxColumns] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toKlexel, setToKlexel] = useState(false);
  // "Nach Klexel…" only when the suite build contains Klexel
  const canReturn = !!useSuite()?.returnToKlexel;

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const options = (): ExportOptions => ({
    animationIds: animations.map((a) => a.id).filter((id) => selected.includes(id)),
    scale,
    padding: Math.max(0, Math.round(padding) || 0),
    maxColumns: Math.max(1, Math.round(maxColumns) || 1),
  });
  const none = options().animationIds.length === 0;

  const preview = async () => {
    setBusy(true);
    setError(null);
    const res = await renderSpritesheet(useEditor.getState().project, options());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(res.png));
  };

  const exportNow = async () => {
    setBusy(true);
    setError(null);
    const { project } = useEditor.getState();
    const res = await renderSpritesheet(project, options());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    download(res.png, `${sanitizeFileName(project.name)}.png`);
    await new Promise((r) => setTimeout(r, 300)); // browsers throttle back-to-back downloads
    download(new Blob([res.json], { type: 'application/json' }), `${sanitizeFileName(project.name)}.json`);
    onClose();
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  if (toKlexel) return <ReturnToKlexelDialog onClose={onClose} />;

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-label="Spritesheet exportieren">
        <h2>Spritesheet exportieren</h2>
        <fieldset>
          <legend>Animationen</legend>
          {animations.length === 0 && <p>Keine Animationen vorhanden.</p>}
          {animations.map((a) => (
            <label key={a.id} style={{ display: 'block' }}>
              <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} /> {a.name}
            </label>
          ))}
        </fieldset>
        <p>
          <label>
            Skalierung{' '}
            <select value={scale} onChange={(e) => setScale(Number(e.target.value) as ExportOptions['scale'])}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}×</option>
              ))}
            </select>
          </label>{' '}
          <label>
            Padding{' '}
            <input type="number" min={0} value={padding} onChange={(e) => setPadding(Number(e.target.value))} />
          </label>{' '}
          <label>
            Spalten{' '}
            <input type="number" min={1} value={maxColumns} onChange={(e) => setMaxColumns(Number(e.target.value))} />
          </label>
        </p>
        {none && <p role="status">{NO_ANIMATION_SELECTED}</p>}
        {error && <p role="alert" style={{ color: '#ff8080' }}>{error}</p>}
        {previewUrl && (
          <div style={{ maxWidth: 480, maxHeight: 260, overflow: 'auto' }}>
            <img src={previewUrl} alt="Spritesheet-Vorschau" style={{ maxWidth: '100%' }} />
          </div>
        )}
        <p>
          <button onClick={preview} disabled={none || busy}>Vorschau</button>{' '}
          <button onClick={exportNow} disabled={none || busy}>Exportieren</button>{' '}
          {canReturn && (
            <>
              <button onClick={() => setToKlexel(true)} disabled={busy}>Nach Klexel…</button>{' '}
            </>
          )}
          <button onClick={onClose}>Abbrechen</button>
        </p>
      </div>
    </div>
  );
}
