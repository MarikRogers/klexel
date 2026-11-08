import type { PixelDocument } from '../model/Document';
import { buildImportDoc, readConsoleFile, sheetLayout, type ImportedSheet, type ImportMode } from '../export/console/import';
import { PICO8 } from '../palette/palettes';
import { PICOTRON } from '../palette/picotron';
import { docHasContent } from '../photo/hasContent';
import { showToast } from './toast';

const COLS = 16;
const PREVIEW_PX = 384;

export interface ConsoleImportDeps {
  getDoc(): PixelDocument;
  onApply(doc: PixelDocument): void;
}

/** Dialog "Konsolenimport": PICO-8 (.p8) und Picotron (.gfx) einlesen, als Blatt oder als Frames übernehmen. */
export function createConsoleImportDialog(deps: ConsoleImportDeps): { open(file: File): Promise<void> } {
  const dlg = document.createElement('dialog');
  dlg.id = 'consoleImportDlg';
  dlg.setAttribute('aria-label', 'Konsolenimport');
  dlg.innerHTML = `
    <div class="cx">
      <h2>Konsolenimport</h2>
      <p class="cx-note cxi-info"></p>
      <label>Modus <select class="cxi-mode"><option value="sheet">Sprite-Blatt als ein Bild</option><option value="frames">Sprites als Frames</option></select></label>
      <canvas class="cx-preview" width="1" height="1"></canvas>
      <p class="cx-note cxi-warn" hidden></p>
      <div class="cx-actions">
        <button type="button" class="cxi-apply">Übernehmen</button>
        <button type="button" class="cx-close">Abbrechen</button>
      </div>
    </div>`;
  document.getElementById('app')!.appendChild(dlg);

  const q = <T extends Element>(sel: string) => dlg.querySelector<T>(sel)!;
  const info = q<HTMLElement>('.cxi-info');
  const warn = q<HTMLElement>('.cxi-warn');
  const modeSel = q<HTMLSelectElement>('.cxi-mode');
  const canvas = q<HTMLCanvasElement>('.cx-preview');
  const applyBtn = q<HTMLButtonElement>('.cxi-apply');

  let sheet: ImportedSheet | null = null;

  function recompute(): void {
    if (!sheet) return;
    const mode = modeSel.value as ImportMode;
    let result: ReturnType<typeof buildImportDoc>;
    try { result = buildImportDoc(sheet, mode); } catch (err) {
      warn.hidden = false; warn.textContent = (err as Error).message; applyBtn.disabled = true; return;
    }
    applyBtn.disabled = false;
    const { doc, dropped } = result;
    warn.hidden = dropped === 0;
    if (dropped > 0) {
      warn.textContent = mode === 'sheet'
        ? `⚠ ${dropped} Sprites passen nicht auf ein Bild (höchstens 128×128) und fehlen. „Sprites als Frames“ übernimmt mehr.`
        : `⚠ Nur die ersten 64 Frames werden übernommen, ${dropped} Sprites fehlen.`;
    }
    draw(doc);
  }

  /** Vorschau: bei Frames als Raster nebeneinander, sonst das Bild selbst. */
  function draw(doc: PixelDocument): void {
    const frames = doc.frames;
    const cols = frames.length === 1 ? 1 : Math.min(COLS, frames.length);
    const rows = Math.ceil(frames.length / cols);
    const nw = cols * doc.width, nh = rows * doc.height;
    const off = document.createElement('canvas');
    off.width = nw; off.height = nh;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(nw, nh);
    frames.forEach((f, n) => {
      const px = doc.compositeFrame(f.id);
      const ox = (n % cols) * doc.width, oy = Math.floor(n / cols) * doc.height;
      for (let y = 0; y < doc.height; y++) for (let x = 0; x < doc.width; x++) {
        const v = px[y * doc.width + x];
        if ((v & 255) === 0) continue;
        const o = ((oy + y) * nw + ox + x) * 4;
        img.data[o] = v >>> 24; img.data[o + 1] = (v >>> 16) & 255; img.data[o + 2] = (v >>> 8) & 255; img.data[o + 3] = v & 255;
      }
    });
    octx.putImageData(img, 0, 0);
    const scale = Math.max(1, Math.floor(PREVIEW_PX / nw));
    canvas.width = nw * scale; canvas.height = nh * scale;
    canvas.style.width = '100%';
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#16161c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  modeSel.onchange = recompute;

  applyBtn.onclick = () => {
    if (!sheet) return;
    if (docHasContent(deps.getDoc()) && !confirm('Das aktuelle Bild wird ersetzt. Fortfahren?')) return;
    try {
      const { doc } = buildImportDoc(sheet, modeSel.value as ImportMode);
      dlg.close();
      deps.onApply(doc);
    } catch (err) {
      showToast((err as Error).message);
    }
  };
  q<HTMLButtonElement>('.cx-close').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  return {
    async open(file) {
      try {
        sheet = readConsoleFile(new Uint8Array(await file.arrayBuffer()));
      } catch (err) {
        console.error(err);
        showToast((err as Error).message || 'Datei konnte nicht gelesen werden');
        return;
      }
      if (sheet.sprites.length === 0) { showToast('Keine Sprites in der Datei gefunden'); return; }
      const n = sheet.sprites.length;
      const l = sheetLayout(sheet);
      info.textContent = `${sheet.target === 'pico8' ? 'PICO-8' : 'Picotron'}: ${n} ${n === 1 ? 'Sprite' : 'Sprites'} (${l.cell}×${l.cell}), ${(sheet.target === 'pico8' ? PICO8 : PICOTRON).length} Farben`;
      // Wenige Sprites → eher Frames (Animation), sonst das Blatt
      modeSel.value = 'sheet';
      recompute();
      if (!dlg.open) dlg.showModal();
    },
  };
}
