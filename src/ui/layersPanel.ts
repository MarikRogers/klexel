import { PixelDocument, Layer, layerActions } from '../model/Document';
import { History } from '../model/History';
import { ICON } from './icons';
import { drawThumb } from './thumb';

export interface LayersPanelDeps {
  getDoc(): PixelDocument;
  getHistory(): History;
  onChange(): void;
  discardStroke(): void;
}

export interface LayersPanel {
  toggle(): void;
  close(): void;
  refresh(): void;
  /** Alle Vorschaubilder beim nächsten refresh() neu zeichnen (Undo/Redo, neues Dokument) */
  invalidate(): void;
  readonly isOpen: boolean;
}

export function createLayersPanel(deps: LayersPanelDeps): LayersPanel {
  const el = document.createElement('div');
  el.id = 'layers';
  el.hidden = true;
  el.innerHTML = `
    <div class="layers-head"><span>Ebenen</span><button class="lp-close" title="Schließen">✕</button></div>
    <div class="layers-list"></div>
    <div class="layers-actions row">
      <button data-act="add" title="Ebene hinzufügen">${ICON.add}</button>
      <button data-act="duplicate" title="Ebene duplizieren">${ICON.duplicate}</button>
      <button data-act="merge" title="Nach unten zusammenführen">${ICON.mergeDown}</button>
      <button data-act="remove" title="Ebene löschen">${ICON.trash}</button>
      <button data-act="up" title="Nach oben">${ICON.up}</button>
      <button data-act="down" title="Nach unten">${ICON.down}</button>
    </div>
    <label class="layers-opacity">Deckkraft <input type="range" min="0" max="100" step="1" /><output>100</output>%</label>`;
  document.getElementById('app')!.appendChild(el);

  const list = el.querySelector<HTMLDivElement>('.layers-list')!;
  const slider = el.querySelector<HTMLInputElement>('input[type=range]')!;
  const output = el.querySelector<HTMLOutputElement>('output')!;
  const act = (name: string) => el.querySelector<HTMLButtonElement>(`[data-act=${name}]`)!;
  let open = false;
  let signature = '';
  let allThumbs = true;
  let thumbFrame = 0;

  const doc = () => deps.getDoc();
  const history = () => deps.getHistory();

  // Strich verwerfen, Aktion ausführen, Anzeige aktualisieren
  function run(fn: () => unknown): void {
    deps.discardStroke();
    fn();
    deps.onChange();
  }

  function drawLayerThumb(canvas: HTMLCanvasElement, layer: Layer, d: PixelDocument): void {
    drawThumb(canvas, d.cel(layer.id, d.currentFrameId), d.width, d.height);
  }

  function rename(layer: Layer): void {
    const name = window.prompt('Name der Ebene', layer.name);
    if (name === null || !name.trim()) return;
    run(() => history().setProps(layer.id, { name }));
  }

  function buildRows(d: PixelDocument): void {
    list.innerHTML = '';
    for (const layer of [...d.layers].reverse()) {
      const row = document.createElement('div');
      row.className = 'layer-row' + (layer.id === d.activeId ? ' active' : '');
      row.dataset.id = String(layer.id);
      const thumb = document.createElement('canvas');
      thumb.width = thumb.height = 24;
      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name;
      const eye = document.createElement('button');
      eye.title = layer.visible ? 'Ausblenden' : 'Einblenden';
      eye.innerHTML = layer.visible ? ICON.eye : ICON.eyeOff;
      const lock = document.createElement('button');
      lock.title = layer.locked ? 'Entsperren' : 'Sperren';
      lock.innerHTML = layer.locked ? ICON.lock : ICON.unlock;
      row.append(thumb, name, eye, lock);
      eye.onclick = e => { e.stopPropagation(); run(() => history().setProps(layer.id, { visible: !layer.visible })); };
      lock.onclick = e => { e.stopPropagation(); run(() => history().setProps(layer.id, { locked: !layer.locked })); };
      row.onclick = e => {
        if (layer.id === deps.getDoc().activeId) {
          if (e.target === name) rename(layer);
          return;
        }
        run(() => deps.getDoc().setActive(layer.id));
      };
      list.appendChild(row);
    }
  }

  function refresh(): void {
    if (!open) return;
    const d = doc();
    // Zeilen nur neu aufbauen, wenn sich Struktur oder Eigenschaften ändern (Schieberziehen nicht stören)
    const sig = d.layers.map(l => `${l.id}|${l.name}|${l.visible}|${l.locked}`).join(';') + `#${d.activeId}`;
    if (sig !== signature) { signature = sig; allThumbs = true; buildRows(d); }
    const rows = list.children;
    if (allThumbs) {
      allThumbs = false;
      for (let i = 0; i < rows.length; i++) {
        drawLayerThumb(rows[i].querySelector('canvas')!, d.layers[d.layers.length - 1 - i], d);
      }
    } else if (!thumbFrame) {
      // Während des Zeichnens nur die aktive Ebene, höchstens einmal pro Frame
      thumbFrame = requestAnimationFrame(() => {
        thumbFrame = 0;
        if (!open) return;
        const cur = doc();
        const row = list.querySelector('.layer-row.active canvas');
        if (row) drawLayerThumb(row as HTMLCanvasElement, cur.activeLayer, cur);
      });
    }
    const a = layerActions(d);
    act('add').disabled = !a.canAdd;
    act('duplicate').disabled = !a.canDuplicate;
    act('merge').disabled = !a.canMergeDown;
    act('remove').disabled = !a.canRemove;
    act('up').disabled = !a.canMoveUp;
    act('down').disabled = !a.canMoveDown;
    slider.value = String(d.activeLayer.opacity);
    output.textContent = String(d.activeLayer.opacity);
    list.querySelector('.layer-row.active')?.scrollIntoView?.({ block: 'nearest' });
  }

  act('add').onclick = () => run(() => history().addLayer());
  act('duplicate').onclick = () => run(() => history().duplicateLayer());
  act('merge').onclick = () => run(() => history().mergeDown());
  act('remove').onclick = () => run(() => history().removeLayer());
  act('up').onclick = () => run(() => history().moveActive(1));
  act('down').onclick = () => run(() => history().moveActive(-1));

  slider.addEventListener('input', () => {
    output.textContent = slider.value;
    history().previewProps(doc().activeId, { opacity: +slider.value });
    deps.onChange();
  });
  slider.addEventListener('change', () => { history().commitProps(); deps.onChange(); });

  function close(): void {
    if (!open) return;
    history().commitProps();
    open = false;
    el.hidden = true;
  }

  el.querySelector<HTMLButtonElement>('.lp-close')!.onclick = close;

  return {
    toggle() {
      if (open) { close(); return; }
      deps.discardStroke();
      open = true;
      el.hidden = false;
      signature = '';
      allThumbs = true;
      refresh();
    },
    close,
    refresh,
    invalidate() { allThumbs = true; },
    get isOpen() { return open; },
  };
}
