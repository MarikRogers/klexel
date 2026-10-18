import { PixelDocument, Color, Frame, Layer, LayerProps, blendOver, layerActions, frameActions } from './Document';

interface Change { i: number; before: Color; after: Color }

type Step =
  | { kind: 'pixels'; layerId: number; frameId: number; changes: Change[] }
  | { kind: 'add'; layer: Layer; index: number; prevActive: number }
  | { kind: 'remove'; layer: Layer; index: number; prevActive: number; nextActive: number }
  | { kind: 'move'; id: number; from: number; to: number }
  | { kind: 'props'; id: number; before: LayerProps; after: LayerProps }
  | { kind: 'merge'; upper: Layer; index: number; lowerId: number; lowerBefore: Map<number, Uint32Array | undefined>; lowerAfter: Map<number, Uint32Array> }
  | { kind: 'addFrame'; frame: Frame; index: number; prevCurrent: number }
  | { kind: 'duplicateFrame'; frame: Frame; index: number; prevCurrent: number; cels: Map<number, Uint32Array | undefined> }
  | { kind: 'removeFrame'; frame: Frame; index: number; prevCurrent: number; nextCurrent: number; cels: Map<number, Uint32Array | undefined> }
  | { kind: 'moveFrame'; id: number; from: number; to: number };

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
  private currentFrameId = 0;
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
    this.currentFrameId = this.doc.currentFrameId;
  }

  set(x: number, y: number, c: Color): boolean {
    if (!this.doc.inBounds(x, y)) return false;
    const i = y * this.doc.width + x;
    const doc = this.doc;
    // Ein laufender Strich schreibt immer in den Frame, in dem er begonnen wurde
    const frameId = this.current ? this.currentFrameId : doc.currentFrameId;
    if (doc.frameIndex(frameId) < 0) return false;
    // ... und in die Ebene, die beim begin() aktiv war
    const layerId = this.current ? this.currentLayerId : doc.activeId;
    if (!doc.getLayer(layerId)) return false;
    const before = doc.cel(layerId, frameId)?.[i] ?? 0;
    if (before === c) return false;
    if (this.current) {
      const existing = this.current.get(i);
      if (existing) existing.after = c;
      else this.current.set(i, { i, before, after: c });
    }
    doc.ensureCel(layerId, frameId)[i] = c;
    doc.touch(frameId);
    return true;
  }

  commit(): void {
    const changes = this.current ? [...this.current.values()] : [];
    const layerId = this.currentLayerId;
    const frameId = this.currentFrameId;
    this.current = null;
    if (changes.length === 0) return;
    this.push({ kind: 'pixels', layerId, frameId, changes });
  }

  /** Verwirft den laufenden Strich und stellt die Pixel wieder her. */
  cancel(): void {
    if (!this.current) return;
    const { currentLayerId: layerId, currentFrameId: frameId } = this;
    const cel = this.doc.cel(layerId, frameId);
    if (cel) for (const ch of this.current.values()) cel[ch.i] = ch.before;
    this.current = null;
    this.doc.touch(frameId);
  }

  /** Setzt ein Pixel des laufenden Strichs auf den Wert vor dem Strich zurück und streicht es aus dem Schritt. */
  unset(x: number, y: number): boolean {
    if (!this.current || !this.doc.inBounds(x, y)) return false;
    const i = y * this.doc.width + x;
    const ch = this.current.get(i);
    if (!ch) return false;
    const cel = this.doc.cel(this.currentLayerId, this.currentFrameId);
    if (cel) cel[i] = ch.before;
    this.current.delete(i);
    this.doc.touch(this.currentFrameId);
    return true;
  }

  /** Macht den neuesten Undo-Schritt rückgängig und verwirft ihn (kein Redo). */
  dropLast(): boolean {
    if (this.current) return false;
    const step = this.undoStack.pop();
    if (!step) return false;
    this.apply(step, 'undo');
    return true;
  }

  get strokeOpen(): boolean { return this.current !== null; }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): boolean {
    if (this.current) return false;
    const step = this.undoStack.pop();
    if (!step) return false;
    this.apply(step, 'undo');
    this.redoStack.push(step);
    return true;
  }

  redo(): boolean {
    if (this.current) return false;
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
    for (const [frameId, cel] of src.cels) layer.cels.set(frameId, cel.slice());
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
    const lowerBefore = new Map<number, Uint32Array | undefined>();
    const lowerAfter = new Map<number, Uint32Array>();
    for (const [frameId, upperCel] of upper.cels) {
      const before = lower.cels.get(frameId);
      const after = before ? before.slice() : new Uint32Array(this.doc.width * this.doc.height);
      for (let i = 0; i < after.length; i++) {
        if (upperCel[i] !== 0) after[i] = blendOver(after[i], upperCel[i], upper.opacity);
      }
      lowerBefore.set(frameId, before?.slice());
      lowerAfter.set(frameId, after);
    }
    this.doc.removeLayer(upper.id);
    for (const [frameId, after] of lowerAfter) lower.cels.set(frameId, after.slice());
    this.doc.setActive(lower.id);
    this.doc.touch();
    this.push({ kind: 'merge', upper, index, lowerId: lower.id, lowerBefore, lowerAfter });
    return true;
  }

  addFrame(): Frame | null {
    if (!frameActions(this.doc).canAdd) return null;
    return this.insertNewFrame(this.doc.createFrame(), undefined);
  }

  duplicateFrame(): Frame | null {
    if (!frameActions(this.doc).canDuplicate) return null;
    const cels = new Map<number, Uint32Array | undefined>();
    for (const layer of this.doc.layers) cels.set(layer.id, layer.cels.get(this.doc.currentFrameId)?.slice());
    return this.insertNewFrame(this.doc.createFrame(), cels);
  }

  private insertNewFrame(frame: Frame, cels: Map<number, Uint32Array | undefined> | undefined): Frame {
    const prevCurrent = this.doc.currentFrameId;
    const index = this.doc.frameIndex(prevCurrent) + 1;
    this.doc.insertFrame(frame, index);
    if (cels) this.doc.restoreFrameCels(frame.id, cels);
    this.doc.setCurrentFrame(frame.id);
    if (cels) this.push({ kind: 'duplicateFrame', frame, index, prevCurrent, cels });
    else this.push({ kind: 'addFrame', frame, index, prevCurrent });
    return frame;
  }

  removeFrame(): boolean {
    if (!frameActions(this.doc).canRemove) return false;
    const prevCurrent = this.doc.currentFrameId;
    const { frame, index, cels } = this.doc.removeFrame(prevCurrent);
    // Frame davor, sonst (erster gelöscht) der neue erste
    const nextCurrent = this.doc.frames[index > 0 ? index - 1 : 0].id;
    this.doc.setCurrentFrame(nextCurrent);
    this.push({ kind: 'removeFrame', frame, index, prevCurrent, nextCurrent, cels });
    return true;
  }

  moveFrame(delta: 1 | -1): boolean {
    const a = frameActions(this.doc);
    if (delta === 1 ? !a.canMoveRight : !a.canMoveLeft) return false;
    const id = this.doc.currentFrameId;
    const from = this.doc.frameIndex(id);
    const to = from + delta;
    this.doc.moveFrame(id, to);
    this.push({ kind: 'moveFrame', id, from, to });
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
        if (!doc.getLayer(step.layerId) || doc.frameIndex(step.frameId) < 0) return;
        const cel = doc.ensureCel(step.layerId, step.frameId);
        for (const ch of step.changes) cel[ch.i] = undo ? ch.before : ch.after;
        doc.setCurrentFrame(step.frameId);
        doc.touch(step.frameId);
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
          for (const [frameId, cel] of step.lowerBefore) {
            if (cel) lower.cels.set(frameId, cel.slice());
            else lower.cels.delete(frameId);
          }
          doc.setActive(step.upper.id);
        } else {
          doc.removeLayer(step.upper.id);
          for (const [frameId, cel] of step.lowerAfter) lower.cels.set(frameId, cel.slice());
          doc.setActive(step.lowerId);
        }
        doc.touch();
        return;
      }
      case 'addFrame':
      case 'duplicateFrame':
        if (undo) {
          doc.removeFrame(step.frame.id);
          doc.setCurrentFrame(step.prevCurrent);
        } else {
          doc.insertFrame(step.frame, step.index);
          if (step.kind === 'duplicateFrame') doc.restoreFrameCels(step.frame.id, step.cels);
          doc.setCurrentFrame(step.frame.id);
        }
        return;
      case 'removeFrame':
        if (undo) {
          doc.insertFrame(step.frame, step.index);
          doc.restoreFrameCels(step.frame.id, step.cels);
          doc.setCurrentFrame(step.prevCurrent);
        } else {
          doc.removeFrame(step.frame.id);
          doc.setCurrentFrame(step.nextCurrent);
        }
        return;
      case 'moveFrame':
        doc.moveFrame(step.id, undo ? step.from : step.to);
        return;
    }
  }
}
