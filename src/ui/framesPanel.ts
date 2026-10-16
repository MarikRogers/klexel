import { PixelDocument, frameActions, MAX_FRAMES } from '../model/Document';
import { History } from '../model/History';
import { ICON } from './icons';
import { drawThumb } from './thumb';
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
    <div id="framesExtras"></div>`;
  document.getElementById('app')!.appendChild(el);

  const strip = el.querySelector<HTMLDivElement>('.frames-strip')!;
  const act = (name: string) => el.querySelector<HTMLButtonElement>(`[data-act=${name}]`)!;
  let open = false;
  let signature = '';
  let allThumbs = true;
  let thumbFrame = 0;

  const doc = () => deps.getDoc();
  const history = () => deps.getHistory();

  // Vorschau committen, Strich verwerfen, Aktion ausführen, Anzeige aktualisieren
  function run(fn: () => unknown): void {
    history().commitProps();
    deps.discardStroke();
    fn();
    deps.onChange();
  }

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
    if (sig !== signature) { signature = sig; allThumbs = true; buildTiles(d); }
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
      });
    }
    const a = frameActions(d);
    // Hinzufügen/Duplizieren bleiben antippbar (Hinweis statt Aktion)
    act('add').setAttribute('aria-disabled', String(!a.canAdd));
    act('duplicate').setAttribute('aria-disabled', String(!a.canDuplicate));
    act('remove').disabled = !a.canRemove;
    act('left').disabled = !a.canMoveLeft;
    act('right').disabled = !a.canMoveRight;
    strip.querySelector('.frame-tile.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
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
      refresh();
    },
    close,
    refresh,
    invalidate() { allThumbs = true; },
    get isOpen() { return open; },
  };
}
