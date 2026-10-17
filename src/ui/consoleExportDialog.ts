import type { PixelDocument } from '../model/Document';
import { buildExportPlan, defaultCell, type ExportFrame, type ExportMode, type ExportOptions, type ExportPlan } from '../export/console/plan';
import type { ConsoleTarget } from '../export/console/reduce';
import { writePico8 } from '../export/console/pico8';
import { writePicotron } from '../export/console/picotron';
import { PICOTRON_IS_PLACEHOLDER } from '../palette/picotron';
import { saveBlob } from '../export/saveBlob';
import { showToast } from './toast';

const COLS = 16; // Sprites je Zeile in der Vorschau (entspricht dem PICO-8-Blatt)
const PREVIEW_PX = 384; // gewünschte Vorschaubreite

/** Dialog "Konsolenexport": PICO-8 (.p8) und Picotron (.gfx). */
export function createConsoleExportDialog(): { open(doc: PixelDocument): void } {
  const dlg = document.createElement('dialog');
  dlg.id = 'consoleDlg';
  dlg.setAttribute('aria-label', 'Konsolenexport');
  dlg.innerHTML = `
    <div class="cx">
      <h2>Konsolenexport</h2>
      <label>Ziel <select class="cx-target"><option value="pico8">PICO-8 (.p8)</option><option value="picotron">Picotron (.gfx)</option></select></label>
      <label>Modus <select class="cx-mode"><option value="slice">Bild zerschneiden</option><option value="frames">Frames als Sprites</option></select></label>
      <label class="cx-cellwrap">Spritegröße <select class="cx-cell"><option value="8">8×8</option><option value="16">16×16</option><option value="32">32×32</option></select></label>
      <label>Startnummer <input class="cx-start" type="number" min="0" max="255" step="1" inputmode="numeric" value="1" /></label>
      <canvas class="cx-preview" width="1" height="1"></canvas>
      <div class="cx-adjust" hidden>
        <span class="cx-adjusttext" role="status"></span>
        <button type="button" class="cx-orig">Original halten</button>
      </div>
      <p class="cx-note" hidden></p>
      <div class="cx-issues"></div>
      <div class="cx-actions">
        <button type="button" class="cx-export">Exportieren</button>
        <button type="button" class="cx-close">Schließen</button>
      </div>
    </div>`;
  document.getElementById('app')!.appendChild(dlg);

  const q = <T extends Element>(sel: string) => dlg.querySelector<T>(sel)!;
  const targetSel = q<HTMLSelectElement>('.cx-target');
  const modeSel = q<HTMLSelectElement>('.cx-mode');
  const cellWrap = q<HTMLElement>('.cx-cellwrap');
  const cellSel = q<HTMLSelectElement>('.cx-cell');
  const startInput = q<HTMLInputElement>('.cx-start');
  const canvas = q<HTMLCanvasElement>('.cx-preview');
  const adjustBox = q<HTMLElement>('.cx-adjust');
  const adjustText = q<HTMLElement>('.cx-adjusttext');
  const origBtn = q<HTMLButtonElement>('.cx-orig');
  const note = q<HTMLElement>('.cx-note');
  const issuesBox = q<HTMLElement>('.cx-issues');
  const exportBtn = q<HTMLButtonElement>('.cx-export');

  let frames: ExportFrame[] = [];
  let current = 0; // Index des aktuellen Frames (Quelle für "Bild zerschneiden")
  let truncate = false;
  let showOriginal = false;
  let plan: ExportPlan | null = null;
  let all: ExportPlan | null = null;

  function options(truncateNow: boolean): ExportOptions {
    const start = Math.round(Number(startInput.value));
    return {
      target: targetSel.value as ConsoleTarget,
      mode: modeSel.value as ExportMode,
      cell: Number(cellSel.value),
      start: Number.isFinite(start) ? start : 1,
      truncate: truncateNow,
    };
  }

  function recompute(): void {
    if (frames.length === 0) return;
    const input = modeSel.value === 'slice' ? [frames[current]] : frames;
    plan = buildExportPlan(input, options(truncate));
    all = buildExportPlan(input, options(false));
    const isPico = targetSel.value === 'pico8';
    cellWrap.hidden = isPico;
    adjustBox.hidden = plan.adjusted === 0;
    adjustText.textContent = `⚠ ${plan.adjusted} ${plan.adjusted === 1 ? 'Farbe' : 'Farben'} angepasst`;
    if (plan.adjusted === 0) showOriginal = false;
    note.hidden = isPico || !PICOTRON_IS_PLACEHOLDER;
    note.textContent = 'Hinweis: Die Picotron-Farbwerte sind noch vorläufig.';
    renderIssues();
    exportBtn.disabled = plan.blocked || plan.sprites.length === 0;
    draw();
  }

  function renderIssues(): void {
    issuesBox.innerHTML = '';
    if (!plan || plan.issues.length === 0) return;
    const box = document.createElement('div');
    box.className = 'cx-issue';
    for (const i of plan.issues) {
      const p = document.createElement('p');
      p.textContent = i.message;
      box.appendChild(p);
    }
    const canCut = !plan.issues.some(i => i.kind === 'empty');
    if (canCut) {
      const row = document.createElement('div');
      row.className = 'cx-issue-actions';
      const cut = document.createElement('button');
      cut.type = 'button'; cut.textContent = 'Abschneiden';
      cut.className = truncate ? 'active' : '';
      cut.onclick = () => { truncate = true; recompute(); };
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.textContent = 'Abbrechen';
      cancel.onclick = () => dlg.close();
      row.append(cut, cancel);
      box.appendChild(row);
    }
    issuesBox.appendChild(box);
  }

  function draw(): void {
    if (!all) return;
    const size = all.sprites[0]?.w ?? 8;
    const maxIndex = all.sprites.reduce((m, s) => Math.max(m, s.index), 0);
    const rows = Math.max(1, Math.ceil((maxIndex + 1) / COLS));
    const nativeW = COLS * size, nativeH = rows * size;
    const scale = Math.max(1, PREVIEW_PX / nativeW);
    canvas.width = Math.round(nativeW * scale); canvas.height = Math.round(nativeH * scale);
    canvas.style.width = '100%';
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#16161c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const off = document.createElement('canvas');
    off.width = nativeW; off.height = nativeH;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(nativeW, nativeH);
    for (const s of all.sprites) {
      const ox = (s.index % COLS) * size, oy = Math.floor(s.index / COLS) * size;
      const src = showOriginal ? s.original : s.mapped;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        const v = src[y * s.w + x];
        if ((v & 255) === 0) continue;
        const o = ((oy + y) * nativeW + ox + x) * 4;
        img.data[o] = v >>> 24; img.data[o + 1] = (v >>> 16) & 255; img.data[o + 2] = (v >>> 8) & 255; img.data[o + 3] = v & 255;
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

    const cw = canvas.width / COLS;
    // Raster
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= COLS; c++) { ctx.moveTo(Math.round(c * cw) + .5, 0); ctx.lineTo(Math.round(c * cw) + .5, canvas.height); }
    for (let r = 0; r <= rows; r++) { ctx.moveTo(0, Math.round(r * cw) + .5); ctx.lineTo(canvas.width, Math.round(r * cw) + .5); }
    ctx.stroke();
    // Nummern; abgeschnittene Sprites (Nummer > 255) abgedunkelt
    ctx.font = `${Math.max(8, Math.min(12, cw / 3))}px sans-serif`;
    ctx.textBaseline = 'top';
    for (const s of all.sprites) {
      const x = (s.index % COLS) * cw, y = Math.floor(s.index / COLS) * cw;
      if (s.index > 255) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x, y, cw, cw); }
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillText(String(s.index), x + 2, y + 1);
    }
  }

  function reset(): void { truncate = false; recompute(); }

  targetSel.onchange = () => {
    if (targetSel.value === 'picotron') cellSel.value = String(defaultCell('picotron', frames));
    reset();
  };
  modeSel.onchange = reset;
  cellSel.onchange = reset;
  startInput.oninput = reset;

  const hold = (on: boolean) => { if (showOriginal !== on) { showOriginal = on; draw(); } };
  origBtn.addEventListener('pointerdown', e => { e.preventDefault(); hold(true); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) origBtn.addEventListener(ev, () => hold(false));
  origBtn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } });
  origBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hold(false); });
  origBtn.addEventListener('contextmenu', e => e.preventDefault());

  exportBtn.onclick = async () => {
    if (!plan || plan.blocked) return;
    exportBtn.disabled = true;
    try {
      if (targetSel.value === 'pico8') {
        await saveBlob(new Blob([writePico8(plan)], { type: 'text/plain' }), 'klexel.p8', 'text/plain');
      } else {
        await saveBlob(new Blob([writePicotron(plan, Number(cellSel.value))], { type: 'text/plain' }), '0.gfx', 'text/plain');
      }
    } catch (err) {
      console.error(err);
      showToast('Export fehlgeschlagen');
    } finally {
      exportBtn.disabled = !plan || plan.blocked || plan.sprites.length === 0;
    }
  };
  q<HTMLButtonElement>('.cx-close').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  return {
    open(doc) {
      frames = doc.frames.map(f => ({ pixels: doc.compositeFrame(f.id).slice(), width: doc.width, height: doc.height }));
      current = Math.max(0, doc.frames.findIndex(f => f.id === doc.currentFrameId));
      truncate = false; showOriginal = false;
      if (targetSel.value === 'picotron') cellSel.value = String(defaultCell('picotron', frames));
      recompute();
      if (!dlg.open) dlg.showModal();
    },
  };
}
