import { PixelDocument, Color, Layer, LayerProps, blendOver, layerActions } from './Document';

interface Change { i: number; before: Color; after: Color }

type Step =
  | { kind: 'pixels'; layerId: number; changes: Change[] }
  | { kind: 'add'; layer: Layer; index: number; prevActive: number }
  | { kind: 'remove'; layer: Layer; index: number; prevActive: number; nextActive: number }
  | { kind: 'move'; id: number; from: number; to: number }
  | { kind: 'props'; id: number; before: LayerProps; after: LayerProps }
  | { kind: 'merge'; upper: Layer; index: number; lowerId: number; lowerBefore: Uint32Array; lowerAfter: Uint32Array };

function snapshot(l: LayerProps): LayerProps {
  return { name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity };
}

function sameProps(a: LayerProps, b: LayerProps): boolean {
  return a.name === b.name && a.visible === b.visible && a.locked === b.locked && a.opacity === b.opacity;
}

export class History {
  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private current: Map<number, Change> | null = null;
  private currentLayerId = 0;
  private pendingProps: { id: number; before: LayerProps } | null = null;

  constructor(private doc: PixelDocument, private limit = 100) {}

  private push(step: Step): void {
    this.undoStack.push(step);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Beginnt einen Strich; alle set()-Aufrufe bis commit() bilden einen Undo-Schritt. */
  begin(): void {
    this.current = new Map();
    this.currentLayerId = this.doc.activeId;
  }

  set(x: number, y: number, c: Color): boolean {
    if (!this.doc.inBounds(x, y)) return false;
    const i = y * this.doc.width + x;
    const before = this.doc.data[i];
    if (before === c) return false;
    if (this.current) {
      const existing = this.current.get(i);
      if (existing) existing.after = c;
      else this.current.set(i, { i, before, after: c });
    }
    this.doc.data[i] = c;
    this.doc.touch();
    return true;
  }

  commit(): void {
    const changes = this.current ? [...this.current.values()] : [];
    const layerId = this.currentLayerId;
    this.current = null;
    if (changes.length === 0) return;
    this.push({ kind: 'pixels', layerId, changes });
  }

  /** Verwirft den laufenden Strich und stellt die Pixel wieder her. */
  cancel(): void {
    if (!this.current) return;
    const layer = this.doc.getLayer(this.currentLayerId);
    if (layer) for (const ch of this.current.values()) layer.data[ch.i] = ch.before;
    this.current = null;
    this.doc.touch();
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): boolean {
    const step = this.undoStack.pop();
    if (!step) return false;
    this.apply(step, 'undo');
    this.redoStack.push(step);
    return true;
  }

  redo(): boolean {
    const step = this.redoStack.pop();
    if (!step) return false;
    this.apply(step, 'redo');
    this.undoStack.push(step);
    return true;
  }

  addLayer(): Layer | null {
    if (!layerActions(this.doc).canAdd) return null;
    return this.insertNew(this.doc.createLayer());
  }

  duplicateLayer(): Layer | null {
    if (!layerActions(this.doc).canDuplicate) return null;
    const src = this.doc.activeLayer;
    const layer = this.doc.createLayer();
    layer.name = `${src.name.slice(0, 18)} Kopie`.slice(0, 24);
    layer.visible = src.visible;
    layer.locked = src.locked;
    layer.opacity = src.opacity;
    layer.data.set(src.data);
    return this.insertNew(layer);
  }

  private insertNew(layer: Layer): Layer {
    const prevActive = this.doc.activeId;
    const index = this.doc.indexOf(prevActive) + 1;
    this.doc.insertLayer(layer, index);
    this.doc.setActive(layer.id);
    this.push({ kind: 'add', layer, index, prevActive });
    return layer;
  }

  removeLayer(): boolean {
    if (!layerActions(this.doc).canRemove) return false;
    const prevActive = this.doc.activeId;
    const { layer, index } = this.doc.removeLayer(prevActive);
    // Ebene darunter, sonst (unterste gelöscht) die oberste
    const target = this.doc.layers[index > 0 ? index - 1 : this.doc.layers.length - 1].id;
    this.doc.setActive(target);
    this.push({ kind: 'remove', layer, index, prevActive, nextActive: target });
    return true;
  }

  moveActive(delta: 1 | -1): boolean {
    const a = layerActions(this.doc);
    if (delta === 1 ? !a.canMoveUp : !a.canMoveDown) return false;
    const id = this.doc.activeId;
    const from = this.doc.indexOf(id);
    const to = from + delta;
    this.doc.moveLayer(id, to);
    this.push({ kind: 'move', id, from, to });
    return true;
  }

  mergeDown(): boolean {
    if (!layerActions(this.doc).canMergeDown) return false;
    const index = this.doc.indexOf(this.doc.activeId);
    const upper = this.doc.layers[index];
    const lower = this.doc.layers[index - 1];
    const lowerBefore = lower.data.slice();
    const lowerAfter = lower.data.slice();
    for (let i = 0; i < lowerAfter.length; i++) {
      if (upper.data[i] !== 0) lowerAfter[i] = blendOver(lowerBefore[i], upper.data[i], upper.opacity);
    }
    this.doc.removeLayer(upper.id);
    lower.data.set(lowerAfter);
    this.doc.setActive(lower.id);
    this.doc.touch();
    this.push({ kind: 'merge', upper, index, lowerId: lower.id, lowerBefore, lowerAfter });
    return true;
  }

  setProps(id: number, props: Partial<LayerProps>): boolean {
    const layer = this.doc.getLayer(id);
    if (!layer) return false;
    const before = snapshot(layer);
    this.doc.setLayerProps(id, props);
    const after = snapshot(layer);
    if (sameProps(before, after)) return false;
    this.push({ kind: 'props', id, before, after });
    return true;
  }

  /** Wendet Eigenschaften sofort an (Schieber); Ausgangswert wird beim ersten Aufruf gemerkt. */
  previewProps(id: number, props: Partial<LayerProps>): void {
    const layer = this.doc.getLayer(id);
    if (!layer) return;
    if (this.pendingProps && this.pendingProps.id !== id) this.commitProps();
    if (!this.pendingProps) this.pendingProps = { id, before: snapshot(layer) };
    this.doc.setLayerProps(id, props);
  }

  commitProps(): boolean {
    const pending = this.pendingProps;
    this.pendingProps = null;
    if (!pending) return false;
    const layer = this.doc.getLayer(pending.id);
    if (!layer) return false;
    const after = snapshot(layer);
    if (sameProps(pending.before, after)) return false;
    this.push({ kind: 'props', id: pending.id, before: pending.before, after });
    return true;
  }

  cancelProps(): void {
    const pending = this.pendingProps;
    this.pendingProps = null;
    if (pending && this.doc.getLayer(pending.id)) this.doc.setLayerProps(pending.id, pending.before);
  }

  private apply(step: Step, dir: 'undo' | 'redo'): void {
    const doc = this.doc;
    const undo = dir === 'undo';
    switch (step.kind) {
      case 'pixels': {
        const layer = doc.getLayer(step.layerId);
        if (!layer) return;
        for (const ch of step.changes) layer.data[ch.i] = undo ? ch.before : ch.after;
        doc.touch();
        return;
      }
      case 'add':
        if (undo) {
          doc.removeLayer(step.layer.id);
          doc.setActive(step.prevActive);
        } else {
          doc.insertLayer(step.layer, step.index);
          doc.setActive(step.layer.id);
        }
        return;
      case 'remove':
        if (undo) {
          doc.insertLayer(step.layer, step.index);
          doc.setActive(step.prevActive);
        } else {
          doc.removeLayer(step.layer.id);
          doc.setActive(step.nextActive);
        }
        return;
      case 'move':
        doc.moveLayer(step.id, undo ? step.from : step.to);
        return;
      case 'props':
        doc.setLayerProps(step.id, undo ? step.before : step.after);
        return;
      case 'merge': {
        const lower = doc.getLayer(step.lowerId);
        if (!lower) return;
        if (undo) {
          doc.insertLayer(step.upper, step.index);
          lower.data.set(step.lowerBefore);
          doc.setActive(step.upper.id);
        } else {
          doc.removeLayer(step.upper.id);
          lower.data.set(step.lowerAfter);
          doc.setActive(step.lowerId);
        }
        doc.touch();
        return;
      }
    }
  }
}
