import './style.css';
import { PixelDocument, Color } from './model/Document';
import { History } from './model/History';
import { Viewport } from './render/Viewport';
import { linePoints } from './tools/line';
import { floodFill } from './tools/fill';
import { rectPoints, ellipsePoints } from './tools/shapes';
import { PICO8, toCss, toHex, fromHex } from './palette/palettes';
import { showToast } from './ui/toast';
import { ICON } from './ui/icons';
import { createLayersPanel } from './ui/layersPanel';
import { saveState, loadState, exportPng, importPng } from './storage/storage';

type ToolName = 'pen' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'ellipse';
type ShapeTool = 'line' | 'rect' | 'ellipse';

const app = document.getElementById('app')!;
app.innerHTML = `
  <div id="top">
    <div class="row">
      <button id="undo" title="Rückgängig">↶</button>
      <button id="redo" title="Wiederholen">↷</button>
      <button id="grid" class="active" title="Raster">▦</button>
      <button id="layersBtn" title="Ebenen">${ICON.layers}</button>
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
      <button data-tool="eraser" title="Radierer">${ICON.eraser}</button>
      <button data-tool="fill" title="Füllen">${ICON.fill}</button>
      <button data-tool="line" title="Linie">╱</button>
      <button data-tool="rect" title="Rechteck">▭</button>
      <button data-tool="ellipse" title="Ellipse">◯</button>
      <button id="fillMode" title="Umriss / gefüllt" hidden>▢</button>
      <button data-tool="picker" title="Pipette">${ICON.picker}</button>
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

const panel = createLayersPanel({
  getDoc: () => doc,
  getHistory: () => history,
  onChange: () => { refresh(); scheduleSave(); },
  discardStroke: () => { endStroke(false); cancelShape(); },
});

function attach(newDoc: PixelDocument): void {
  shapeStart = shapeEnd = null;
  panel.close();
  panel.invalidate();
  doc = newDoc; history = new History(doc); view = new Viewport(canvas, doc);
  view.fit(); refresh();
}

function refresh(): void {
  view.render();
  $<HTMLButtonElement>('undo').disabled = !history.canUndo;
  $<HTMLButtonElement>('redo').disabled = !history.canRedo;
  panel.refresh();
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

// ---- Formen: Vorschau beim Ziehen, ein Undo-Schritt beim Loslassen ----
let filledShapes = false;
let shapeStart: [number, number] | null = null;
let shapeEnd: [number, number] | null = null;

const isShape = (t: ToolName): t is ShapeTool => t === 'line' || t === 'rect' || t === 'ellipse';

function shapePoints(t: ShapeTool, a: [number, number], b: [number, number]): Array<[number, number]> {
  if (t === 'line') return linePoints(a[0], a[1], b[0], b[1]);
  if (t === 'rect') return rectPoints(a[0], a[1], b[0], b[1], filledShapes);
  return ellipsePoints(a[0], a[1], b[0], b[1], filledShapes);
}

function updateShapePreview(): void {
  if (!shapeStart || !shapeEnd || !isShape(tool)) { view.preview = null; return; }
  view.preview = { points: shapePoints(tool, shapeStart, shapeEnd), color };
}

function cancelShape(): void {
  shapeStart = shapeEnd = null; view.preview = null;
}

function commitShape(): void {
  if (shapeStart && shapeEnd && isShape(tool)) {
    history.begin();
    for (const [px, py] of shapePoints(tool, shapeStart, shapeEnd)) history.set(px, py, color);
    history.commit();
    scheduleSave();
  }
  cancelShape();
}

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
    endStroke(false); // zweiter Finger: laufenden Strich bzw. Form verwerfen
    cancelShape();
    const [a, b] = [...pointers.values()];
    gesture = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: view.zoom };
    refresh(); return;
  }
  if (pointers.size > 2) return;
  const [x, y] = view.toDoc(cx, cy);
  if (tool === 'picker') {
    const c = doc.getComposite(x, y);
    if (c) { color = c; renderSwatches(); }
    return;
  }
  const reason = doc.drawBlockReason();
  if (reason) { showToast(reason === 'locked' ? 'Ebene gesperrt' : 'Ebene ausgeblendet'); return; }
  if (isShape(tool)) {
    shapeStart = shapeEnd = [x, y]; updateShapePreview(); refresh(); return;
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
  if (shapeStart) {
    shapeEnd = view.toDoc(cx, cy); updateShapePreview(); refresh(); return;
  }
  if (!drawing) return;
  const [x, y] = view.toDoc(cx, cy);
  apply(x, y); refresh();
});

function release(e: PointerEvent): void {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) gesture = null;
  if (shapeStart) { commitShape(); refresh(); return; }
  if (drawing) { endStroke(true); scheduleSave(); refresh(); }
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', e => { endStroke(false); cancelShape(); release(e); refresh(); });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  view.zoomAt(e.offsetX, e.offsetY, view.zoom + (e.deltaY < 0 ? 1 : -1)); refresh();
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---- Buttons ----
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => {
  b.onclick = () => {
    cancelShape();
    tool = b.dataset.tool as ToolName;
    document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('active', x === b));
    $('fillMode').hidden = !(tool === 'rect' || tool === 'ellipse');
    refresh();
  };
});
$('fillMode').onclick = e => {
  filledShapes = !filledShapes;
  (e.currentTarget as HTMLElement).textContent = filledShapes ? '◼' : '▢';
  (e.currentTarget as HTMLElement).classList.toggle('active', filledShapes);
};
$('undo').onclick = () => { endStroke(false); cancelShape(); history.commitProps(); history.undo(); panel.invalidate(); refresh(); scheduleSave(); };
$('redo').onclick = () => { endStroke(false); cancelShape(); history.commitProps(); history.redo(); panel.invalidate(); refresh(); scheduleSave(); };
$('layersBtn').onclick = () => { panel.toggle(); refresh(); };
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
  attach(s.doc);
});
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js');
