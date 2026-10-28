import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '../core/messages';
import {
  dedupeNames,
  gridCellCount,
  gridRects,
  MAX_IMPORT_CELLS,
  TOO_MANY_CELLS,
  type GridOptions,
  type SheetRect,
} from '../core/sheetImport';
import { useEditor } from '../state/store';
import { drawSheetPreview, sliceSheet } from './sliceSheet';
import { useSheetSource } from './useSheetSource';

const num = (v: string) => (v === '' ? 0 : Number(v));

/** The grid form keeps both modes' fields, so switching the mode back restores the values. */
interface GridForm {
  mode: GridOptions['mode'];
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  margin: number;
  spacing: number;
}

type GridField = Exclude<keyof GridForm, 'mode'>;

const toGridOptions = ({ mode, cols, rows, cellW, cellH, margin, spacing }: GridForm): GridOptions =>
  mode === 'count' ? { mode, cols, rows, margin, spacing } : { mode, cellW, cellH, margin, spacing };

/** Atlas frames that lie completely inside the image. */
const insideImage = (atlas: SheetRect[], w: number, h: number) =>
  atlas.filter((r) => r.w > 0 && r.h > 0 && r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h);

export function ImportSheetDialog({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { img, baseName, setBaseName, atlas, atlasSkipped, atlasError, loadPng, loadJson } = useSheetSource(setError);
  const [grid, setGrid] = useState<GridForm>({ mode: 'count', cols: 4, rows: 2, cellW: 32, cellH: 32, margin: 0, spacing: 0 });
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const imgW = img?.naturalWidth ?? 0;
  const imgH = img?.naturalHeight ?? 0;

  const { rects, skipped, tooMany } = useMemo(() => {
    if (!img) return { rects: [] as SheetRect[], skipped: 0, tooMany: false };
    if (atlas) {
      const inside = insideImage(atlas, imgW, imgH);
      return { rects: dedupeNames(inside), skipped: atlasSkipped + atlas.length - inside.length, tooMany: false };
    }
    const opts = toGridOptions(grid);
    return {
      rects: gridRects(imgW, imgH, opts, baseName || 'sheet'),
      skipped: 0,
      tooMany: gridCellCount(imgW, imgH, opts) > MAX_IMPORT_CELLS,
    };
  }, [img, imgW, imgH, atlas, grid, baseName, atlasSkipped]);

  useEffect(() => {
    if (canvasRef.current && img) drawSheetPreview(canvasRef.current, img, rects);
  }, [img, rects]);

  const doImport = async () => {
    if (!img || atlasError || tooMany) return;
    if (rects.length === 0) {
      setError('Keine Sprites gefunden – Einstellungen prüfen');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const assets = await sliceSheet(img, rects, skipEmpty);
      if (assets.length === 0) {
        setError('Alle Zellen sind leer');
        return;
      }
      useEditor.getState().addImages(assets);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const numField = (label: string, field: GridField) => (
    <label>
      {label}
      <input
        type="number"
        min={0}
        value={grid[field]}
        onChange={(e) => {
          const value = num(e.target.value);
          setGrid((g) => ({ ...g, [field]: value }));
        }}
      />
    </label>
  );

  const shownError = atlasError ?? (tooMany ? TOO_MANY_CELLS : error);

  return (
    <div className="dialog-backdrop">
      <div className="dialog sheet-dialog" role="dialog" aria-label="Spritesheet importieren">
        <h2>Spritesheet importieren</h2>
        <label>
          Spritesheet (PNG)
          <input type="file" accept="image/png" aria-label="Spritesheet-Bild" onChange={(e) => void loadPng(e.target.files?.[0])} />
        </label>
        <label>
          Atlas (JSON, optional)
          <input type="file" accept="application/json,.json" aria-label="Atlas-JSON" onChange={(e) => void loadJson(e.target.files?.[0])} />
        </label>
        {!atlas && (
          <>
            <label>
              Modus
              <select
                aria-label="Modus"
                value={grid.mode}
                onChange={(e) => {
                  const mode = e.target.value as GridForm['mode'];
                  setGrid((g) => ({ ...g, mode }));
                }}
              >
                <option value="count">Anzahl</option>
                <option value="size">Zellgröße</option>
              </select>
            </label>
            {grid.mode === 'count' ? (
              <>
                {numField('Spalten', 'cols')}
                {numField('Zeilen', 'rows')}
              </>
            ) : (
              <>
                {numField('Zellbreite', 'cellW')}
                {numField('Zellhöhe', 'cellH')}
              </>
            )}
            {numField('Rand', 'margin')}
            {numField('Abstand', 'spacing')}
            <label>
              Basisname
              <input type="text" value={baseName} onChange={(e) => setBaseName(e.target.value)} />
            </label>
          </>
        )}
        <label>
          <input type="checkbox" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
          Leere Zellen überspringen
        </label>
        {img && <canvas ref={canvasRef} className="sheet-preview" aria-label="Vorschau" />}
        {img && <div>{rects.length} Zellen</div>}
        {skipped > 0 && <div role="status">{skipped} Frames ungültig oder außerhalb des Bildes übersprungen</div>}
        {shownError && (
          <div role="alert" className="error">
            {shownError}
          </div>
        )}
        <div className="dialog-actions">
          <button disabled={!img || busy || tooMany || !!atlasError} onClick={() => void doImport()}>
            Importieren
          </button>
          <button onClick={onClose}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
