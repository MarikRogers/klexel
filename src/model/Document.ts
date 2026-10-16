export const MAX_SIZE = 128;
export const MAX_LAYERS = 16;
export const MAX_FRAMES = 64;
export const MAX_PIXELS = 16_000_000;
const MAX_NAME = 24;

export type Color = number; // 0xRRGGBBAA

export interface LayerProps {
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // ganzzahlig 0..100
}

export interface Frame {
  id: number;
}

export interface Layer extends LayerProps {
  id: number;
  // RGBA packed as 0xRRGGBBAA, 0 = transparent; fehlende Cel = vollständig transparent
  cels: Map<number, Uint32Array>;
}

export type DrawBlock = 'locked' | 'hidden' | null;

// Source-over mit nicht-prämultipliziertem Alpha; srcOpacity 0..100
export function blendOver(dst: Color, src: Color, srcOpacity: number): Color {
  const sa = ((src & 255) / 255) * (srcOpacity / 100);
  const da = (dst & 255) / 255;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return 0;
  const k = da * (1 - sa);
  const r = Math.round((((src >>> 24) & 255) * sa + ((dst >>> 24) & 255) * k) / outA);
  const g = Math.round((((src >>> 16) & 255) * sa + ((dst >>> 16) & 255) * k) / outA);
  const b = Math.round((((src >>> 8) & 255) * sa + ((dst >>> 8) & 255) * k) / outA);
  const out = (r * 256 + g) * 256 + b;
  return (out * 256 + Math.round(outA * 255)) >>> 0;
}

export interface DocumentState {
  width: number;
  height: number;
  frames: Frame[];
  currentFrameId: number;
  nextFrameId: number;
  layers: Layer[];
  activeId: number;
  nextId: number;
  fps?: number;
  onion?: boolean;
}

export class PixelDocument {
  readonly width: number;
  readonly height: number;
  layers: Layer[];
  activeId: number;
  nextId: number;
  frames: Frame[];
  currentFrameId: number;
  nextFrameId: number;
  fps = 8;
  onion = false;
  private caches = new Map<number, Uint32Array>();

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) {
      throw new RangeError(`Größe muss 1..${MAX_SIZE} sein`);
    }
    this.width = width;
    this.height = height;
    this.layers = [{ id: 1, name: 'Ebene 1', visible: true, locked: false, opacity: 100, cels: new Map() }];
    this.activeId = 1;
    this.nextId = 2;
    this.frames = [{ id: 1 }];
    this.currentFrameId = 1;
    this.nextFrameId = 2;
  }

  static restore(state: DocumentState): PixelDocument {
    const { width, height, frames, layers } = state;
    if (layers.length < 1 || layers.length > MAX_LAYERS) throw new RangeError(`Ebenenanzahl muss 1..${MAX_LAYERS} sein`);
    if (frames.length < 1 || frames.length > MAX_FRAMES) throw new RangeError(`Frameanzahl muss 1..${MAX_FRAMES} sein`);
    const frameIds = new Set<number>();
    for (const f of frames) {
      if (!Number.isInteger(f.id) || f.id < 1 || frameIds.has(f.id)) throw new RangeError('Frame-ID ungültig');
      frameIds.add(f.id);
    }
    const layerIds = new Set<number>();
    for (const l of layers) {
      if (!Number.isInteger(l.id) || layerIds.has(l.id)) throw new RangeError('Ebenen-ID ungültig');
      layerIds.add(l.id);
      for (const [fid, cel] of l.cels) {
        if (!frameIds.has(fid)) throw new RangeError('Cel zu unbekanntem Frame');
        if (cel.length !== width * height) throw new RangeError('Ebenendaten passen nicht zur Größe');
      }
    }
    if (!frameIds.has(state.currentFrameId)) throw new RangeError('Aktueller Frame unbekannt');
    if (!layerIds.has(state.activeId)) throw new RangeError('Aktive Ebene unbekannt');
    if (width * height * layers.length * frames.length > MAX_PIXELS) throw new RangeError('Speicherbudget überschritten');
    const doc = new PixelDocument(width, height);
    doc.layers = [...layers];
    doc.activeId = state.activeId;
    doc.nextId = state.nextId;
    doc.frames = frames.map((f) => ({ ...f }));
    doc.currentFrameId = state.currentFrameId;
    doc.nextFrameId = Math.max(state.nextFrameId, Math.max(...frames.map((f) => f.id)) + 1);
    if (state.fps !== undefined) doc.fps = state.fps;
    if (state.onion !== undefined) doc.onion = state.onion;
    return doc;
  }

  get activeLayer(): Layer {
    return this.layers[this.indexOf(this.activeId)];
  }

  get data(): Uint32Array {
    return this.ensureCel(this.activeId, this.currentFrameId);
  }

  cel(layerId: number, frameId: number): Uint32Array | undefined {
    return this.getLayer(layerId)?.cels.get(frameId);
  }

  ensureCel(layerId: number, frameId: number): Uint32Array {
    const layer = this.getLayer(layerId);
    if (!layer) throw new RangeError('Ebene unbekannt');
    if (this.frameIndex(frameId) < 0) throw new RangeError('Frame unbekannt');
    let cel = layer.cels.get(frameId);
    if (!cel) {
      cel = new Uint32Array(this.width * this.height);
      layer.cels.set(frameId, cel);
    }
    return cel;
  }

  fitsBudget(extraLayers = 0, extraFrames = 0): boolean {
    return this.width * this.height * (this.layers.length + extraLayers) * (this.frames.length + extraFrames) <= MAX_PIXELS;
  }

  frameIndex(id: number): number {
    return this.frames.findIndex((f) => f.id === id);
  }

  createFrame(): Frame {
    return { id: this.nextFrameId++ };
  }

  insertFrame(frame: Frame, index: number): void {
    if (this.frames.length >= MAX_FRAMES) throw new RangeError(`Höchstens ${MAX_FRAMES} Frames`);
    if (!this.fitsBudget(0, 1)) throw new RangeError('Speicherbudget überschritten');
    this.frames.splice(Math.max(0, Math.min(index, this.frames.length)), 0, frame);
    this.touch();
  }

  removeFrame(id: number): { frame: Frame; index: number; cels: Map<number, Uint32Array | undefined> } {
    if (this.frames.length <= 1) throw new RangeError('Letzter Frame kann nicht entfernt werden');
    const index = this.frameIndex(id);
    if (index < 0) throw new RangeError('Frame unbekannt');
    const [frame] = this.frames.splice(index, 1);
    const cels = new Map<number, Uint32Array | undefined>();
    for (const layer of this.layers) {
      cels.set(layer.id, layer.cels.get(id));
      layer.cels.delete(id);
    }
    this.touch(id);
    return { frame, index, cels };
  }

  moveFrame(id: number, toIndex: number): void {
    const from = this.frameIndex(id);
    if (from < 0) throw new RangeError('Frame unbekannt');
    const [frame] = this.frames.splice(from, 1);
    this.frames.splice(Math.max(0, Math.min(toIndex, this.frames.length)), 0, frame);
  }

  setCurrentFrame(id: number): void {
    if (this.frameIndex(id) < 0) throw new RangeError('Frame unbekannt');
    this.currentFrameId = id;
  }

  restoreFrameCels(frameId: number, cels: Map<number, Uint32Array | undefined>): void {
    if (this.frameIndex(frameId) < 0) throw new RangeError('Frame unbekannt');
    for (const [layerId, cel] of cels) {
      const layer = this.getLayer(layerId);
      if (!layer) continue;
      if (cel) layer.cels.set(frameId, cel);
      else layer.cels.delete(frameId);
    }
    this.touch(frameId);
  }

  getLayer(id: number): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  indexOf(id: number): number {
    return this.layers.findIndex((l) => l.id === id);
  }

  createLayer(name?: string): Layer {
    const id = this.nextId++;
    return { id, name: name ?? `Ebene ${id}`, visible: true, locked: false, opacity: 100, cels: new Map() };
  }

  insertLayer(layer: Layer, index: number): void {
    if (this.layers.length >= MAX_LAYERS) throw new RangeError(`Höchstens ${MAX_LAYERS} Ebenen`);
    if (!this.fitsBudget(1, 0)) throw new RangeError('Speicherbudget überschritten');
    this.layers.splice(Math.max(0, Math.min(index, this.layers.length)), 0, layer);
    this.touch();
  }

  removeLayer(id: number): { layer: Layer; index: number } {
    if (this.layers.length <= 1) throw new RangeError('Letzte Ebene kann nicht entfernt werden');
    const index = this.indexOf(id);
    if (index < 0) throw new RangeError('Ebene unbekannt');
    const [layer] = this.layers.splice(index, 1);
    this.touch();
    return { layer, index };
  }

  moveLayer(id: number, toIndex: number): void {
    const from = this.indexOf(id);
    if (from < 0) throw new RangeError('Ebene unbekannt');
    const [layer] = this.layers.splice(from, 1);
    this.layers.splice(Math.max(0, Math.min(toIndex, this.layers.length)), 0, layer);
    this.touch();
  }

  setLayerProps(id: number, props: Partial<LayerProps>): void {
    const layer = this.getLayer(id);
    if (!layer) throw new RangeError('Ebene unbekannt');
    if (props.opacity !== undefined) layer.opacity = Math.max(0, Math.min(100, Math.round(props.opacity)));
    if (props.name !== undefined) {
      const name = props.name.trim().slice(0, MAX_NAME);
      if (name) layer.name = name;
    }
    if (props.visible !== undefined) layer.visible = props.visible;
    if (props.locked !== undefined) layer.locked = props.locked;
    this.touch();
  }

  setActive(id: number): void {
    if (this.indexOf(id) < 0) throw new RangeError('Ebene unbekannt');
    this.activeId = id;
  }

  // Verwirft den Composite-Cache eines Frames (ohne Argument aller); nach direkten Änderungen an Cels aufrufen
  touch(frameId?: number): void {
    if (frameId === undefined) this.caches.clear();
    else this.caches.delete(frameId);
  }

  composite(): Uint32Array {
    return this.compositeFrame(this.currentFrameId);
  }

  compositeFrame(frameId: number): Uint32Array {
    const cached = this.caches.get(frameId);
    if (cached) return cached;
    if (this.frameIndex(frameId) < 0) throw new RangeError('Frame unbekannt');
    const out = new Uint32Array(this.width * this.height);
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      const data = layer.cels.get(frameId);
      if (!data) continue;
      const opaque = layer.opacity === 100;
      for (let i = 0; i < out.length; i++) {
        const s = data[i];
        if (s === 0) continue;
        // Schnellpfad: deckendes Pixel bei 100 % ersetzt das Ergebnis, ebenso über Transparent
        out[i] = opaque && ((s & 255) === 255 || out[i] === 0) ? s : blendOver(out[i], s, layer.opacity);
      }
    }
    this.caches.set(frameId, out);
    return out;
  }

  getComposite(x: number, y: number): Color {
    return this.inBounds(x, y) ? this.composite()[y * this.width + x] : 0;
  }

  drawBlockReason(): DrawBlock {
    const l = this.activeLayer;
    if (l.locked) return 'locked';
    if (!l.visible) return 'hidden';
    return null;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Color {
    if (!this.inBounds(x, y)) return 0;
    return this.cel(this.activeId, this.currentFrameId)?.[y * this.width + x] ?? 0;
  }

  set(x: number, y: number, c: Color): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    if (this.get(x, y) === c) return false;
    this.data[i] = c;
    this.touch(this.currentFrameId);
    return true;
  }
}

export function layerActions(doc: PixelDocument): {
  canAdd: boolean;
  canDuplicate: boolean;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canMergeDown: boolean;
} {
  const n = doc.layers.length;
  const i = doc.indexOf(doc.activeId);
  return {
    canAdd: n < MAX_LAYERS && doc.fitsBudget(1, 0),
    canDuplicate: n < MAX_LAYERS && doc.fitsBudget(1, 0),
    canRemove: n > 1,
    canMoveUp: i < n - 1,
    canMoveDown: i > 0,
    canMergeDown: i > 0 && doc.layers[i].visible && !doc.layers[i - 1].locked,
  };
}

export function frameActions(doc: PixelDocument): {
  canAdd: boolean;
  canDuplicate: boolean;
  canRemove: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
} {
  const n = doc.frames.length;
  const i = doc.frameIndex(doc.currentFrameId);
  const canGrow = n < MAX_FRAMES && doc.fitsBudget(0, 1);
  return {
    canAdd: canGrow,
    canDuplicate: canGrow,
    canRemove: n > 1,
    canMoveLeft: i > 0,
    canMoveRight: i < n - 1,
  };
}
