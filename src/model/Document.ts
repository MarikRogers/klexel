export const MAX_SIZE = 128;
export const MAX_LAYERS = 16;
const MAX_NAME = 24;

export type Color = number; // 0xRRGGBBAA

export interface LayerProps {
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // ganzzahlig 0..100
}

export interface Layer extends LayerProps {
  id: number;
  data: Uint32Array; // RGBA packed as 0xRRGGBBAA, 0 = transparent
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

export class PixelDocument {
  readonly width: number;
  readonly height: number;
  layers: Layer[];
  activeId: number;
  nextId: number;
  private cache: Uint32Array | null = null;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) {
      throw new RangeError(`Größe muss 1..${MAX_SIZE} sein`);
    }
    this.width = width;
    this.height = height;
    this.layers = [{ id: 1, name: 'Ebene 1', visible: true, locked: false, opacity: 100, data: new Uint32Array(width * height) }];
    this.activeId = 1;
    this.nextId = 2;
  }

  static fromLayers(width: number, height: number, layers: Layer[], activeId: number, nextId: number): PixelDocument {
    if (layers.length < 1 || layers.length > MAX_LAYERS) throw new RangeError(`Ebenenanzahl muss 1..${MAX_LAYERS} sein`);
    if (layers.some((l) => l.data.length !== width * height)) throw new RangeError('Ebenendaten passen nicht zur Größe');
    if (!layers.some((l) => l.id === activeId)) throw new RangeError('Aktive Ebene unbekannt');
    const doc = new PixelDocument(width, height);
    doc.layers = layers;
    doc.activeId = activeId;
    doc.nextId = nextId;
    return doc;
  }

  get activeLayer(): Layer {
    return this.layers[this.indexOf(this.activeId)];
  }

  get data(): Uint32Array {
    return this.activeLayer.data;
  }

  getLayer(id: number): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  indexOf(id: number): number {
    return this.layers.findIndex((l) => l.id === id);
  }

  createLayer(name?: string): Layer {
    const id = this.nextId++;
    return { id, name: name ?? `Ebene ${id}`, visible: true, locked: false, opacity: 100, data: new Uint32Array(this.width * this.height) };
  }

  insertLayer(layer: Layer, index: number): void {
    if (this.layers.length >= MAX_LAYERS) throw new RangeError(`Höchstens ${MAX_LAYERS} Ebenen`);
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

  // Verwirft den Composite-Cache; nach direkten Änderungen an layer.data aufrufen
  touch(): void {
    this.cache = null;
  }

  composite(): Uint32Array {
    if (this.cache) return this.cache;
    const out = new Uint32Array(this.width * this.height);
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity === 0) continue;
      const data = layer.data;
      const opaque = layer.opacity === 100;
      for (let i = 0; i < out.length; i++) {
        const s = data[i];
        if (s === 0) continue;
        // Schnellpfad: deckendes Pixel bei 100 % ersetzt das Ergebnis, ebenso über Transparent
        out[i] = opaque && ((s & 255) === 255 || out[i] === 0) ? s : blendOver(out[i], s, layer.opacity);
      }
    }
    this.cache = out;
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
    return this.inBounds(x, y) ? this.data[y * this.width + x] : 0;
  }

  set(x: number, y: number, c: Color): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    if (this.data[i] === c) return false;
    this.data[i] = c;
    this.touch();
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
    canAdd: n < MAX_LAYERS,
    canDuplicate: n < MAX_LAYERS,
    canRemove: n > 1,
    canMoveUp: i < n - 1,
    canMoveDown: i > 0,
    canMergeDown: i > 0 && doc.layers[i].visible && !doc.layers[i - 1].locked,
  };
}
