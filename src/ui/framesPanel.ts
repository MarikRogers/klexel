import { PixelDocument, frameActions, MAX_FRAMES } from '../model/Document';
import { History } from '../model/History';
import { ICON } from './icons';
import { drawThumb } from './thumb';
import { nextPlaybackIndex } from '../render/onion';
import { renderSheet, frameFiles, sheetLayout, sheetTooLarge, type SheetMode } from '../export/sheet';
import { buildZip } from '../export/zip';
import { saveBlob } from '../export/saveBlob';
import { showToast } from './toast';

export interface FramesPanelDeps {
  getDoc(): PixelDocument;
  getHistory(): History;
  onChange(): void;
  discardStroke(): void;
}

export interface FramesPanel {
  toggle(): void;
  close(): void;
  refresh(): void;
  /** Alle Vorschaubilder beim nächsten refresh() neu zeichnen (Undo/Redo, neues Dokument) */
  invalidate(): void;
  readonly isOpen: boolean;
}

export function createFramesPanel(deps: FramesPanelDeps): FramesPanel {
  const el = document.createElement('div');
  el.id = 'frames';
  el.hidden = true;
  el.innerHTML = `
    <div class="frames-head"><span>Frames</span><button class="fp-close" title="Schließen">✕</button></div>
    <div class="frames-strip"></div>
    <div class="frames-actions row">
      <button data-act="add" title="Frame hinzufügen">${ICON.addFrame}</button>
      <button data-act="duplicate" title="Frame duplizieren">${ICON.duplicateFrame}</button>
      <button data-act="remove" title="Frame löschen">${ICON.trash}</button>
      <button data-act="left" title="Nach links">${ICON.left}</button>
      <button data-act="right" title="Nach rechts">${ICON.right}</button>
    </div>
    <div id="framesExtras">
      <div class="fx-play">
        <canvas class="fx-preview" width="1" height="1"></canvas>
        <div class="fx-controls">
          <button class="fx-playbtn" title="Abspielen">${ICON.play}<span>Abspielen</span></button>
          <label class="fx-fps">FPS <input class="fx-fpsrange" type="range" min="1" max="30" step="1" /><output></output></label>
        </div>
      </div>
      <label class="fx-onion"><input class="fx-onionchk" type="checkbox" /> ${ICON.onion}<span>Onion Skin</span></label>
      <div class="fx-export">
        <div class="fx-title">Export</div>
        <div class="fx-row">
          <label>Layout <select class="fx-layout">
            <option value="row">Streifen waagerecht</option>
            <option value="column">Streifen senkrecht</option>
            <option value="grid">Raster</option>
          </select></label>
          <label class="fx-colswrap" hidden>Spalten <input class="fx-cols" type="number" min="1" step="1" inputmode="numeric" /></label>
          <label>Skalierung <select class="fx-scale">
            <option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option>
          </select></label>
        </div>
        <div class="fx-row">
          <button class="fx-sheet">Spritesheet (PNG)</button>
          <button class="fx-zip">Einzelbilder (ZIP)</button>
        </div>
      </div>
    </div>`;
  document.getElementById('app')!.appendChild(el);

  const strip = el.querySelector<HTMLDivElement>('.frames-strip')!;
  const act = (name: string) => el.querySelector<HTMLButtonElement>(`[data-act=${name}]`)!;
  let open = false;
  let signature = '';
  let allThumbs = true;
  let thumbFrame = 0;

  const q = <T extends Element>(sel: string) => el.querySelector<T>(sel)!;
  const playBtn = q<HTMLButtonElement>('.fx-playbtn');
  const preview = q<HTMLCanvasElement>('.fx-preview');
  const fpsRange = q<HTMLInputElement>('.fx-fpsrange');
  const fpsOut = q<HTMLOutputElement>('.fx-fps output');
  const onionChk = q<HTMLInputElement>('.fx-onionchk');
  const layoutSel = q<HTMLSelectElement>('.fx-layout');
  const colsWrap = q<HTMLLabelElement>('.fx-colswrap');
  const colsInput = q<HTMLInputElement>('.fx-cols');
  const scaleSel = q<HTMLSelectElement>('.fx-scale');
  const sheetBtn = q<HTMLButtonElement>('.fx-sheet');
  const zipBtn = q<HTMLButtonElement>('.fx-zip');
  let playing = false;
  let playRaf = 0;
  let playIndex = 0;
  let playLast = 0;
  let playAcc = 0;
  let colsDirty = false;
  let previewImg: ImageData | null = null;
  let shownIndex = -1;

  const doc = () => deps.getDoc();
  const history = () => deps.getHistory();

  // Vorschau committen, Strich verwerfen, Aktion ausführen, Anzeige aktualisieren
  function run(fn: () => unknown): void {
    history().commitProps();
    deps.discardStroke();
    fn();
    deps.onChange();
  }

  function drawPreview(d: PixelDocument, frameId: number): void {
    if (preview.width !== d.width || preview.height !== d.height) { preview.width = d.width; preview.height = d.height; }
    const ctx = preview.getContext('2d')!;
    if (!previewImg || previewImg.width !== d.width || previewImg.height !== d.height) previewImg = ctx.createImageData(d.width, d.height);
    const img = previewImg;
    const px = d.compositeFrame(frameId);
    for (let i = 0; i < px.length; i++) {
      const c = px[i];
      img.data[i * 4] = c >>> 24; img.data[i * 4 + 1] = (c >>> 16) & 255; img.data[i * 4 + 2] = (c >>> 8) & 255; img.data[i * 4 + 3] = c & 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function setPlayLabel(): void {
    playBtn.innerHTML = `${playing ? ICON.stop : ICON.play}<span>${playing ? 'Stopp' : 'Abspielen'}</span>`;
    playBtn.title = playing ? 'Stopp' : 'Abspielen';
  }

  function stopPlayback(): void {
    if (playRaf) cancelAnimationFrame(playRaf);
    playRaf = 0;
    if (!playing) return;
    playing = false;
    setPlayLabel();
    if (open) drawPreview(doc(), doc().currentFrameId);
  }

  function playStep(now: number): void {
    playRaf = 0;
    if (!playing || !open) return;
    const d = doc();
    if (d.frames.length < 2) { stopPlayback(); refreshExtras(); return; }
    playAcc += now - playLast; playLast = now;
    const dt = 1000 / d.fps;
    // Verpasste Schritte nachholen, aber höchstens eine Runde (Tab im Hintergrund)
    const steps = Math.min(Math.floor(playAcc / dt), d.frames.length);
    playAcc = playAcc % dt;
    for (let i = 0; i < steps; i++) playIndex = nextPlaybackIndex(playIndex, d.frames.length);
    if (playIndex >= d.frames.length) playIndex = 0;
    if (playIndex !== shownIndex) { shownIndex = playIndex; drawPreview(d, d.frames[playIndex].id); }
    playRaf = requestAnimationFrame(playStep);
  }

  function startPlayback(): void {
    const d = doc();
    if (playing || d.frames.length < 2) return;
    playing = true;
    playIndex = d.frameIndex(d.currentFrameId);
    playLast = performance.now(); playAcc = 0; shownIndex = -1;
    setPlayLabel();
    playRaf = requestAnimationFrame(playStep);
  }

  const defaultCols = (n: number) => Math.ceil(Math.sqrt(n));

  function refreshExtras(): void {
    const d = doc();
    const n = d.frames.length;
    if (n < 2 && playing) stopPlayback();
    playBtn.disabled = n < 2;
    if (document.activeElement !== fpsRange) fpsRange.value = String(d.fps);
    fpsOut.textContent = String(d.fps);
    onionChk.checked = d.onion;
    colsInput.max = String(n);
    colsWrap.hidden = layoutSel.value !== 'grid';
    if (!colsDirty) colsInput.value = String(defaultCols(n));
  }

  function sanitizedColumns(n: number): number {
    const raw = colsInput.value.trim();
    const v = raw === '' ? NaN : Math.round(Number(raw));
    return Math.min(Math.max(Number.isFinite(v) ? v : defaultCols(n), 1), n);
  }

  async function exportWith(job: () => Promise<void>): Promise<void> {
    sheetBtn.disabled = zipBtn.disabled = true;
    try { await job(); } catch (err) { console.error(err); showToast('Export fehlgeschlagen'); } finally { sheetBtn.disabled = zipBtn.disabled = false; }
  }

  playBtn.onclick = () => { if (playing) stopPlayback(); else startPlayback(); };
  fpsRange.oninput = () => { doc().fps = Number(fpsRange.value); fpsOut.textContent = fpsRange.value; deps.onChange(); };
  onionChk.onchange = () => { doc().onion = onionChk.checked; deps.onChange(); };
  layoutSel.onchange = () => { colsWrap.hidden = layoutSel.value !== 'grid'; };
  colsInput.oninput = () => { colsDirty = colsInput.value.trim() !== ''; };
  sheetBtn.onclick = () => exportWith(async () => {
    const d = doc();
    const mode = layoutSel.value as SheetMode;
    const scale = Number(scaleSel.value);
    const cols = mode === 'grid' ? sanitizedColumns(d.frames.length) : undefined;
    if (sheetTooLarge(sheetLayout(d.frames.length, d.width, d.height, mode, cols), scale)) { showToast('Spritesheet zu groß'); return; }
    await saveBlob(await renderSheet(d, mode, cols, scale), 'spritesheet.png', 'image/png');
  });
  zipBtn.onclick = () => exportWith(async () => {
    const files = await frameFiles(doc(), Number(scaleSel.value));
    await saveBlob(new Blob([buildZip(files) as BlobPart], { type: 'application/zip' }), 'frames.zip', 'application/zip');
  });

  function drawTile(tile: Element, d: PixelDocument, frameId: number): void {
    drawThumb(tile.querySelector('canvas')!, d.compositeFrame(frameId), d.width, d.height);
  }

  function buildTiles(d: PixelDocument): void {
    strip.innerHTML = '';
    d.frames.forEach((frame, i) => {
      const tile = document.createElement('button');
      tile.className = 'frame-tile' + (frame.id === d.currentFrameId ? ' active' : '');
      tile.dataset.id = String(frame.id);
      tile.title = `Frame ${i + 1}`;
      const thumb = document.createElement('canvas');
      thumb.width = thumb.height = 24;
      const num = document.createElement('span');
      num.textContent = String(i + 1);
      tile.append(thumb, num);
      tile.onclick = () => {
        if (frame.id === deps.getDoc().currentFrameId) return;
        run(() => deps.getDoc().setCurrentFrame(frame.id));
      };
      strip.appendChild(tile);
    });
  }

  function refresh(): void {
    if (!open) return;
    const d = doc();
    // Tiles nur neu aufbauen, wenn sich Reihenfolge oder aktueller Frame ändern
    const sig = d.frames.map(f => f.id).join(',') + `#${d.currentFrameId}`;
    const rebuilt = sig !== signature;
    if (rebuilt) { signature = sig; allThumbs = true; buildTiles(d); }
    const tiles = strip.children;
    if (allThumbs) {
      allThumbs = false;
      for (let i = 0; i < tiles.length; i++) drawTile(tiles[i], d, d.frames[i].id);
    } else if (!thumbFrame) {
      // Während des Zeichnens nur der aktuelle Frame, höchstens einmal pro Animationsframe
      thumbFrame = requestAnimationFrame(() => {
        thumbFrame = 0;
        if (!open) return;
        const cur = doc();
        const tile = strip.querySelector('.frame-tile.active');
        if (tile) drawTile(tile, cur, cur.currentFrameId);
        if (!playing) drawPreview(cur, cur.currentFrameId);
      });
    }
    const a = frameActions(d);
    // Hinzufügen/Duplizieren bleiben antippbar (Hinweis statt Aktion)
    act('add').setAttribute('aria-disabled', String(!a.canAdd));
    act('duplicate').setAttribute('aria-disabled', String(!a.canDuplicate));
    act('remove').disabled = !a.canRemove;
    act('left').disabled = !a.canMoveLeft;
    act('right').disabled = !a.canMoveRight;
    if (rebuilt) strip.querySelector('.frame-tile.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    refreshExtras();
    if (!playing && rebuilt) drawPreview(d, d.currentFrameId);
  }

  function grow(fn: () => unknown): void {
    const d = doc();
    if (!frameActions(d).canAdd) {
      showToast(d.frames.length >= MAX_FRAMES ? 'Frame-Limit erreicht' : 'Speicherlimit erreicht');
      return;
    }
    run(fn);
  }

  act('add').onclick = () => grow(() => history().addFrame());
  act('duplicate').onclick = () => grow(() => history().duplicateFrame());
  act('remove').onclick = () => run(() => history().removeFrame());
  act('left').onclick = () => run(() => history().moveFrame(-1));
  act('right').onclick = () => run(() => history().moveFrame(1));

  function close(): void {
    stopPlayback();
    if (!open) return;
    open = false;
    el.hidden = true;
  }

  el.querySelector<HTMLButtonElement>('.fp-close')!.onclick = close;

  return {
    toggle() {
      if (open) { close(); return; }
      deps.discardStroke();
      open = true;
      el.hidden = false;
      signature = '';
      allThumbs = true;
      colsDirty = false;
      refresh();
    },
    close,
    refresh,
    invalidate() { allThumbs = true; },
    get isOpen() { return open; },
  };
}
