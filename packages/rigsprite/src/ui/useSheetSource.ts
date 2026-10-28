import { useRef, useState } from 'react';
import { errorMessage, FILE_UNREADABLE } from '../core/messages';
import { parseAtlas, type SheetRect } from '../core/sheetImport';
import { loadSheetImage } from './sliceSheet';

export interface SheetSource {
  img: HTMLImageElement | null;
  /** Name prefix for grid cells (from the PNG file name, editable). */
  baseName: string;
  setBaseName(name: string): void;
  /** Frames from the atlas JSON, if one is loaded. */
  atlas: SheetRect[] | null;
  /** Atlas frames that were invalid already when parsing. */
  atlasSkipped: number;
  atlasError: string | null;
  loadPng(file: File | undefined): Promise<void>;
  loadJson(file: File | undefined): Promise<void>;
}

/**
 * The spritesheet PNG and optional atlas JSON of the import dialog. Load failures of the PNG are
 * reported through `setError` (which a new load also clears); atlas errors are kept separately.
 */
export function useSheetSource(setError: (message: string | null) => void): SheetSource {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [baseName, setBaseName] = useState('sheet');
  const [atlas, setAtlas] = useState<SheetRect[] | null>(null);
  const [atlasSkipped, setAtlasSkipped] = useState(0);
  const [atlasError, setAtlasError] = useState<string | null>(null);
  // Only the latest PNG load may win.
  const loadSeq = useRef(0);

  const loadPng = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const seq = ++loadSeq.current;
    try {
      const loaded = await loadSheetImage(file);
      if (seq !== loadSeq.current) return;
      setImg(loaded);
      setBaseName(file.name.replace(/\.[^.]+$/, '') || 'sheet');
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setImg(null);
      setError(errorMessage(e));
    }
  };

  const loadJson = async (file: File | undefined) => {
    setError(null);
    if (!file) {
      setAtlas(null);
      setAtlasError(null);
      return;
    }
    try {
      const res = parseAtlas(await file.text());
      if (res.ok) {
        setAtlas(res.rects);
        setAtlasSkipped(res.skipped);
        setAtlasError(null);
      } else {
        setAtlas(null);
        setAtlasError(res.error);
      }
    } catch {
      setAtlas(null);
      setAtlasError(`${file.name}: ${FILE_UNREADABLE}`);
    }
  };

  return { img, baseName, setBaseName, atlas, atlasSkipped, atlasError, loadPng, loadJson };
}
