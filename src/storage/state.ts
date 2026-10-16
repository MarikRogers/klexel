import { PixelDocument, MAX_LAYERS, MAX_SIZE, type Layer, type LayerProps } from '../model/Document';

export type SavedLayer = LayerProps & { id: number; data: Uint32Array };

export interface SavedState {
  version: 2;
  width: number;
  height: number;
  layers: SavedLayer[];
  activeId: number;
  nextId: number;
  palette: number[];
  color: number;
}

export function serializeState(doc: PixelDocument, palette: number[], color: number): SavedState {
  return {
    version: 2,
    width: doc.width,
    height: doc.height,
    layers: doc.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      data: (l.cels.get(doc.currentFrameId) ?? new Uint32Array(doc.width * doc.height)).slice(),
    })),
    activeId: doc.activeId,
    nextId: doc.nextId,
    palette,
    color,
  };
}

const ONE_FRAME = { frames: [{ id: 1 }], currentFrameId: 1, nextFrameId: 2 };

function isSize(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_SIZE;
}

function isNumberArray(a: unknown): a is number[] {
  return Array.isArray(a) && a.every((n) => typeof n === 'number');
}

function parseLayer(raw: any, length: number): Layer | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, name, visible, locked, opacity, data } = raw;
  if (!Number.isInteger(id) || typeof name !== 'string') return null;
  if (typeof visible !== 'boolean' || typeof locked !== 'boolean') return null;
  if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100) return null;
  if (!(data instanceof Uint32Array) || data.length !== length) return null;
  return { id, name, visible, locked, opacity, cels: new Map([[1, data]]) };
}

export function parseState(raw: unknown): { doc: PixelDocument; palette: number[]; color: number } | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as any;
    if (!isSize(s.width) || !isSize(s.height)) return null;
    if (!isNumberArray(s.palette) || typeof s.color !== 'number') return null;
    const length = s.width * s.height;
    let doc: PixelDocument;
    if (s.version === undefined) {
      if (!(s.data instanceof Uint32Array) || s.data.length !== length) return null;
      const layer: Layer = { id: 1, name: 'Ebene 1', visible: true, locked: false, opacity: 100, cels: new Map([[1, s.data]]) };
      doc = PixelDocument.restore({ ...ONE_FRAME, width: s.width, height: s.height, layers: [layer], activeId: 1, nextId: 2 });
    } else if (s.version === 2) {
      if (!Array.isArray(s.layers) || s.layers.length < 1 || s.layers.length > MAX_LAYERS) return null;
      const layers: Layer[] = [];
      for (const r of s.layers) {
        const l = parseLayer(r, length);
        if (!l || layers.some((o) => o.id === l.id)) return null;
        layers.push(l);
      }
      if (!Number.isInteger(s.activeId) || !Number.isInteger(s.nextId)) return null;
      const nextId = Math.max(s.nextId, Math.max(...layers.map((l) => l.id)) + 1);
      doc = PixelDocument.restore({ ...ONE_FRAME, width: s.width, height: s.height, layers, activeId: s.activeId, nextId });
    } else {
      return null;
    }
    return { doc, palette: s.palette, color: s.color };
  } catch {
    return null;
  }
}
