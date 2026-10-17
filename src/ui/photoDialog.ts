import { PixelDocument, MAX_SIZE, type Color } from '../model/Document';
import { PICO8 } from '../palette/palettes';
import { PICOTRON } from '../palette/picotron';
import { resizePhoto, cropRect, type FitMode, type PhotoImage, type ResizeOptions } from '../photo/resize';
import { quantize, type Dither } from '../photo/quantize';
import { docHasContent } from '../photo/hasContent';
import { showToast } from './toast';

const MAX_DECODE = 4096; // längste Seite beim Dekodieren (Speicher auf dem Handy schonen)

export interface PhotoDialogDeps {
  getDoc(): PixelDocument;
  getPalette(): Color[];
  onApply(doc: PixelDocument): void;
}

/** Dialog "Foto → Pixelart": Foto verkleinern, auf Palette abbilden, als neues Bild übernehmen. */
export function createPhotoDialog(deps: PhotoDialogDeps): { open(file: File): Promise<void> } {
  const dlg = document.createElement('dialog');
  dlg.id = 'photoDlg';
  dlg.setAttribute('aria-label', 'Foto zu Pixelart');
  dlg.innerHTML = `
    <div class="ph">
      <h2>Foto zu Pixelart</h2>
      <label>Modus <select class="ph-mode">
        <option value="crop">Zuschneiden</option><option value="fit">Einpassen</option><option value="keep">Verhältnis behalten</option>
      </select></label>
      <div class="ph-sizes">
        <div class="ph-wh"><label>Breite <input class="ph-w" type="number" min="1" max="${MAX_SIZE}" step="1" inputmode="numeric" value="32" /></label>
        <label>Höhe <input class="ph-h" type="number" min="1" max="${MAX_SIZE}" step="1" inputmode="numeric" value="32" /></label></div>
        <label class="ph-longwrap">Längste Seite <input class="ph-long" type="number" min="1" max="${MAX_SIZE}" step="1" inputmode="numeric" value="32" /></label>
        <div class="ph-presets"><button type="button" data-size="16">16</button><button type="button" data-size="32">32</button><button type="button" data-size="64">64</button></div>
      </div>
      <label>Palette <select class="ph-pal">
        <option value="pico8">PICO-8</option><option value="picotron">Picotron</option><option value="current">Aktuelle</option>
      </select></label>
      <label>Dithering <select class="ph-dither">
        <option value="none">Aus</option><option value="bayer">Bayer</option><option value="floyd">Floyd-Steinberg</option>
      </select></label>
      <canvas class="ph-preview" width="1" height="1"></canvas>
      <p class="ph-hint" hidden></p>
      <div class="ph-row"><button type="button" class="ph-orig">Original halten</button></div>
      <div class="ph-actions">
        <button type="button" class="ph-apply">Übernehmen</button>
        <button type="button" class="ph-cancel">Abbrechen</button>
      </div>
    </div>`;
  document.getElementById('app')!.appendChild(dlg);

  const q = <T extends Element>(sel: string) => dlg.querySelector<T>(sel)!;
  const modeSel = q<HTMLSelectElement>('.ph-mode');
  const whWrap = q<HTMLElement>('.ph-wh');
  const wInput = q<HTMLInputElement>('.ph-w');
  const hInput = q<HTMLInputElement>('.ph-h');
  const longWrap = q<HTMLElement>('.ph-longwrap');
  const longInput = q<HTMLInputElement>('.ph-long');
  const palSel = q<HTMLSelectElement>('.ph-pal');
  const ditherSel = q<HTMLSelectElement>('.ph-dither');
  const canvas = q<HTMLCanvasElement>('.ph-preview');
  const hint = q<HTMLElement>('.ph-hint');
  const origBtn = q<HTMLButtonElement>('.ph-orig');
  const applyBtn = q<HTMLButtonElement>('.ph-apply');

  let photo: PhotoImage | null = null;
  let panX = 0.5, panY = 0.5;
  let showOriginal = false;
  let result: PhotoImage | null = null;

  const num = (el: HTMLInputElement, fallback: number) => {
    const raw = el.value.trim();
    const v = raw === '' ? fallback : Math.round(Number(raw));
    return Math.min(MAX_SIZE, Math.max(1, Number.isFinite(v) ? v : fallback));
  };

  function options(): ResizeOptions {
    return { mode: modeSel.value as FitMode, width: num(wInput, 32), height: num(hInput, 32), longest: num(longInput, 32), panX, panY };
  }

  function palette(): Color[] {
    if (palSel.value === 'pico8') return PICO8;
    if (palSel.value === 'picotron') return PICOTRON;
    return deps.getPalette();
  }

  function recompute(): void {
    if (!photo) return;
    const mode = modeSel.value;
    whWrap.hidden = mode === 'keep';
    longWrap.hidden = mode !== 'keep';
    const resized = resizePhoto(photo, options());
    const pal = palette();
    const skipFirst = palSel.value !== 'current';
    const need = skipFirst ? 2 : 1;
    if (pal.length < need) {
      hint.hidden = false;
      hint.textContent = 'Die aktuelle Palette hat keine Farben.';
      applyBtn.disabled = true;
      result = null;
      drawImage(resized);
      return;
    }
    hint.hidden = pal.length >= 2;
    hint.textContent = pal.length < 2 ? 'Die aktuelle Palette hat nur eine Farbe.' : '';
    const q = quantize(resized.pixels, resized.width, resized.height, pal, ditherSel.value as Dither, skipFirst);
    result = { width: resized.width, height: resized.height, pixels: q };
    applyBtn.disabled = false;
    drawImage(showOriginal ? resized : result);
  }

  function drawImage(img: PhotoImage): void {
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    const id = ctx.createImageData(img.width, img.height);
    for (let i = 0; i < img.pixels.length; i++) {
      const v = img.pixels[i];
      id.data[i * 4] = v >>> 24; id.data[i * 4 + 1] = (v >>> 16) & 255; id.data[i * 4 + 2] = (v >>> 8) & 255; id.data[i * 4 + 3] = v & 255;
    }
    ctx.putImageData(id, 0, 0);
    canvas.style.aspectRatio = `${img.width} / ${img.height}`;
  }

  for (const el of [modeSel, palSel, ditherSel]) el.onchange = () => { recompute(); };
  for (const el of [wInput, hInput, longInput]) el.oninput = () => { recompute(); };
  for (const b of dlg.querySelectorAll<HTMLButtonElement>('.ph-presets button')) {
    b.onclick = () => {
      const s = b.dataset.size!;
      wInput.value = s; hInput.value = s; longInput.value = s;
      recompute();
    };
  }

  // Zuschneiden: Foto in der Vorschau verschieben
  let drag: { x: number; y: number; panX: number; panY: number } | null = null;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', e => {
    if (modeSel.value !== 'crop' || !photo) return;
    drag = { x: e.clientX, y: e.clientY, panX, panY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag || !photo) return;
    const o = options();
    const rect = cropRect(photo.width, photo.height, o.width, o.height, drag.panX, drag.panY);
    const box = canvas.getBoundingClientRect();
    // Foto folgt dem Finger: nach rechts ziehen = Ausschnitt wandert nach links
    const dx = ((e.clientX - drag.x) / box.width) * rect.w;
    const dy = ((e.clientY - drag.y) / box.height) * rect.h;
    const rangeX = photo.width - rect.w, rangeY = photo.height - rect.h;
    if (rangeX > 0) panX = Math.min(1, Math.max(0, (drag.panX * rangeX - dx) / rangeX));
    if (rangeY > 0) panY = Math.min(1, Math.max(0, (drag.panY * rangeY - dy) / rangeY));
    recompute();
  });
  for (const ev of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(ev, () => { drag = null; });

  const hold = (on: boolean) => { if (showOriginal !== on) { showOriginal = on; recompute(); } };
  origBtn.addEventListener('pointerdown', e => { e.preventDefault(); hold(true); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) origBtn.addEventListener(ev, () => hold(false));
  origBtn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); hold(true); } });
  origBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hold(false); });
  origBtn.addEventListener('contextmenu', e => e.preventDefault());

  applyBtn.onclick = () => {
    if (!result) return;
    if (docHasContent(deps.getDoc()) && !confirm('Das aktuelle Bild wird ersetzt. Fortfahren?')) return;
    const d = new PixelDocument(result.width, result.height);
    for (let i = 0; i < result.pixels.length; i++) d.data[i] = result.pixels[i];
    dlg.close();
    deps.onApply(d);
  };
  q<HTMLButtonElement>('.ph-cancel').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  async function decode(file: File): Promise<PhotoImage> {
    let bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longest = Math.max(bmp.width, bmp.height);
    if (longest > MAX_DECODE) {
      const k = MAX_DECODE / longest;
      const small = await createImageBitmap(bmp, { resizeWidth: Math.max(1, Math.round(bmp.width * k)), resizeHeight: Math.max(1, Math.round(bmp.height * k)), resizeQuality: 'high' });
      bmp.close(); bmp = small;
    }
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const pixels = new Uint32Array(c.width * c.height);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = ((id.data[i * 4] << 24) | (id.data[i * 4 + 1] << 16) | (id.data[i * 4 + 2] << 8) | id.data[i * 4 + 3]) >>> 0;
    }
    const out = { width: c.width, height: c.height, pixels };
    bmp.close();
    return out;
  }

  return {
    async open(file) {
      try {
        photo = await decode(file);
      } catch (err) {
        console.error(err);
        showToast('Bild konnte nicht geladen werden');
        return;
      }
      panX = panY = 0.5; showOriginal = false;
      modeSel.value = 'crop'; palSel.value = 'pico8'; ditherSel.value = 'none';
      wInput.value = hInput.value = longInput.value = '32';
      recompute();
      if (!dlg.open) dlg.showModal();
    },
  };
}
