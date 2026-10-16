import './style.css';
import { PixelDocument, Color } from './model/Document';
import { History } from './model/History';
import { Viewport } from './render/Viewport';
import { linePoints } from './tools/line';
import { floodFill } from './tools/fill';
import { PICO8, toCss, toHex, fromHex } from './palette/palettes';
import { saveState, loadState, exportPng, importPng } from './storage/storage';

type ToolName = 'pen' | 'eraser' | 'fill' | 'picker';

const app = document.getElementById('app')!;
app.innerHTML = `
  <div id="top">
    <div class="row">
      <button id="undo" title="Rückgängig">↶</button>
      <button id="redo" title="Wiederholen">↷</button>
      <button id="grid" class="active" title="Raster">▦</button>
    </div>
    <div class="row">
      <button id="new" title="Neu">＋</button>
      <button id="import" title="PNG laden">⤒</button>
      <button id="export" title="PNG speichern">⤓</button>
    </div>
  </div>
  <div id="stage"><canvas></canvas><button id="toggle" title="Leisten ein-/ausblenden">☰</button></div>
  <div id="bottom">
    <div class="row" id="tools">
      <button data-tool="pen" class="active" title="Stift">✎</button>
      <button data-tool="eraser" title="Radierer">⌫</button>
      <button data-tool="fill" title="Füllen">▣</button>
      <button data-tool="picker" title="Pipette">⌖</button>
      <button id="custom" title="Eigene Farbe">🎨</button>
      <input id="colorInput" type="color" hidden />
    </div>
    <div class="swatches" id="swatches"></div>
  </div>
  <dialog id="newDlg"><form method="dialog">
    <label>Breite <input id="nw" type="number" min="1" max="128" value="32" /></label>
    <label>Höhe <input id="nh" type="number" min="1" max="128" value="32" /></label>
    <div class="row"><button value="cancel">Abbrechen</button><button value="ok">Anlegen</button></div>
  </form></dialog>
  <input id="file" type="file" accept="image/png" hidden />`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = app.querySelector('canvas')!;

let doc = new PixelDocument(32, 32);
let history = new History(doc);
let view = new Viewport(canvas, doc);
let palette: Color[] = [...PICO8];
let color: Color = palette[8];
let tool: ToolName = 'pen';

function attach(newDoc: PixelDocument): void {
  doc = newDoc; history = new History(doc); view = new Viewport(canvas, doc);
  view.fit(); refresh();
}

function refresh(): void {
  view.render();
  $<HTMLButtonElement>('undo').disabled = !history.canUndo;
  $<HTMLButtonElement>('redo').disabled = !history.canRedo;
}

let saveTimer = 0;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void saveState(doc, palette, color); }, 500);
}

function renderSwatches(): void {
  const box = $('swatches'); box.innerHTML = '';
  palette.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === color ? ' active' : '');
    b.style.background = toCss(c);
    b.onclick = () => { color = c; renderSwatches(); scheduleSave(); };
    box.appendChild(b);
  });
}

// ---- Eingabe: 1 Finger zeichnen, 2 Finger Pinch/Pan ----
const pointers = new Map<number, { x: number; y: number }>();
let drawing = false;
let last: [number, number] | null = null;
let gesture: { dist: number; cx: number; cy: number; zoom: number } | null = null;

const local = (e: PointerEvent): [number, number] => {
  const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top];
};
const paintColor = () => (tool === 'eraser' ? 0 : color);

function apply(x: number, y: number): void {
  if (tool === 'pen' || tool === 'eraser') {
    const pts = last ? linePoints(last[0], last[1], x, y) : [[x, y] as [number, number]];
    for (const [px, py] of pts) history.set(px, py, paintColor());
    last = [x, y];
  }
}

function endStroke(commit: boolean): void {
  if (!drawing) return;
  drawing = false; last = null;
  if (commit) history.commit(); else history.cancel();
}

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const [cx, cy] = local(e);
  pointers.set(e.pointerId, { x: cx, y: cy });
  if (pointers.size === 2) {
    endStroke(false); // zweiter Finger: laufenden Strich verwerfen
    const [a, b] = [...pointers.values()];
    gesture = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: view.zoom };
    refresh(); return;
  }
  if (pointers.size > 2) return;
  const [x, y] = view.toDoc(cx, cy);
  if (tool === 'picker') {
    const c = doc.get(x, y);
    if (doc.inBounds(x, y) && c) { color = c; renderSwatches(); }
    return;
  }
  drawing = true; history.begin();
  if (tool === 'fill') { floodFill(doc, history, x, y, color); endStroke(true); scheduleSave(); }
  else apply(x, y);
  refresh();
});

canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const [cx, cy] = local(e);
  p.x = cx; p.y = cy;
  if (gesture && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    view.panX += mx - gesture.cx; view.panY += my - gesture.cy;
    view.zoomAt(mx, my, Math.round(gesture.zoom * dist / Math.max(gesture.dist, 1)));
    gesture.cx = mx; gesture.cy = my; gesture.zoom = view.zoom; gesture.dist = dist;
    refresh(); return;
  }
  if (!drawing) return;
  const [x, y] = view.toDoc(cx, cy);
  apply(x, y); refresh();
});

function release(e: PointerEvent): void {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) gesture = null;
  if (drawing) { endStroke(true); scheduleSave(); refresh(); }
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', e => { endStroke(false); release(e); refresh(); });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  view.zoomAt(e.offsetX, e.offsetY, view.zoom + (e.deltaY < 0 ? 1 : -1)); refresh();
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---- Buttons ----
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => {
  b.onclick = () => {
    tool = b.dataset.tool as ToolName;
    document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('active', x === b));
  };
});
$('undo').onclick = () => { history.undo(); refresh(); scheduleSave(); };
$('redo').onclick = () => { history.redo(); refresh(); scheduleSave(); };
$('grid').onclick = e => { view.showGrid = !view.showGrid; (e.currentTarget as HTMLElement).classList.toggle('active', view.showGrid); refresh(); };
$('custom').onclick = () => { const i = $<HTMLInputElement>('colorInput'); i.value = toHex(color); i.click(); };
$<HTMLInputElement>('colorInput').onchange = e => {
  color = fromHex((e.target as HTMLInputElement).value);
  if (!palette.includes(color)) palette = [color, ...palette.slice(0, 15)];
  renderSwatches(); scheduleSave();
};
$('new').onclick = () => $<HTMLDialogElement>('newDlg').showModal();
$<HTMLDialogElement>('newDlg').addEventListener('close', function (this: HTMLDialogElement) {
  if (this.returnValue !== 'ok') return;
  const w = Math.round(+$<HTMLInputElement>('nw').value), h = Math.round(+$<HTMLInputElement>('nh').value);
  try { attach(new PixelDocument(w, h)); scheduleSave(); } catch { alert('Größe muss zwischen 1 und 128 liegen.'); }
});
$('export').onclick = async () => {
  const scale = Math.max(1, Math.floor(512 / Math.max(doc.width, doc.height)));
  const blob = await exportPng(doc, scale);
  const file = new File([blob], 'pixelart.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch { /* abgebrochen */ }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pixelart.png'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('import').onclick = () => $('file').click();
$<HTMLInputElement>('file').onchange = async e => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0]; if (!f) return;
  try { attach(await importPng(f)); scheduleSave(); } catch (err) { alert((err as Error).message); }
  input.value = '';
};
window.addEventListener('resize', () => { view.fit(); refresh(); });

// Leisten einklappen (Zustand bleibt erhalten); danach Ansicht neu einpassen
const COLLAPSE_KEY = 'pixelart.collapsed';
function setCollapsed(on: boolean): void {
  app.classList.toggle('collapsed', on);
  try { localStorage.setItem(COLLAPSE_KEY, on ? '1' : '0'); } catch { /* Speicher gesperrt */ }
  requestAnimationFrame(() => { view.fit(); refresh(); });
}
$('toggle').onclick = () => setCollapsed(!app.classList.contains('collapsed'));
try { if (localStorage.getItem(COLLAPSE_KEY) === '1') app.classList.add('collapsed'); } catch { /* ignorieren */ }
// Größenänderungen der Fläche (z. B. Adressleiste, Drehen) neu zeichnen, Zoom/Pan bleiben
new ResizeObserver(() => refresh()).observe($('stage'));

// ---- Start ----
renderSwatches();
view.fit(); refresh();
void loadState().then(s => {
  if (!s) return;
  palette = s.palette; color = s.color; renderSwatches();
  attach(new PixelDocument(s.width, s.height, s.data));
});
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
