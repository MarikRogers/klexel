import { PixelDocument, MAX_LAYERS, MAX_SIZE, MAX_FRAMES, MAX_PIXELS, type Frame, type Layer, type LayerProps } from '../model/Document';

export type SavedLayer = LayerProps & { id: number; cels: Record<string, Uint32Array> };

export interface SavedState {
  version: 3;
  width: number;
  height: number;
  frames: Frame[];
  currentFrameId: number;
  nextFrameId: number;
  layers: SavedLayer[];
  activeId: number;
  nextId: number;
  fps: number;
  onion: boolean;
  palette: number[];
  color: number;
}

export function serializeState(doc: PixelDocument, palette: number[], color: number): SavedState {
  return {
    version: 3,
    width: doc.width,
    height: doc.height,
    frames: doc.frames.map((f) => ({ ...f })),
    currentFrameId: doc.currentFrameId,
    nextFrameId: doc.nextFrameId,
    layers: doc.layers.map((l) => {
      const cels: Record<string, Uint32Array> = {};
      for (const [fid, cel] of l.cels) cels[String(fid)] = cel.slice();
      return { id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, cels };
    }),
    activeId: doc.activeId,
    nextId: doc.nextId,
    fps: doc.fps,
    onion: doc.onion,
    palette,
    color,
  };
}

function isSize(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_SIZE;
}

function isNumberArray(a: unknown): a is number[] {
  return Array.isArray(a) && a.every((n) => typeof n === 'number');
}

// Gemeinsame Prüfung der Ebeneneigenschaften; liefert sie oder null
function parseProps(raw: any): (LayerProps & { id: number }) | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, name, visible, locked, opacity } = raw;
  if (!Number.isInteger(id) || typeof name !== 'string') return null;
  if (typeof visible !== 'boolean' || typeof locked !== 'boolean') return null;
  if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100) return null;
  return { id, name, visible, locked, opacity };
}

function parseLayerV2(raw: any, length: number): Layer | null {
  const p = parseProps(raw);
  if (!p) return null;
  const data = raw.data;
  if (!(data instanceof Uint32Array) || data.length !== length) return null;
  return { ...p, cels: new Map([[1, data]]) };
}

function parseLayerV3(raw: any, length: number, frameIds: Set<number>): Layer | null {
  const p = parseProps(raw);
  if (!p) return null;
  const c = raw.cels;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const cels = new Map<number, Uint32Array>();
  for (const key of Object.keys(c)) {
    if (!/^[1-9]\d*$/.test(key)) return null;
    const fid = Number(key);
    const cel = c[key];
    if (!frameIds.has(fid) || !(cel instanceof Uint32Array) || cel.length !== length) return null;
    cels.set(fid, cel);
  }
  return { ...p, cels };
}

function parseFrames(raw: unknown): Frame[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_FRAMES) return null;
  const frames: Frame[] = [];
  for (const f of raw) {
    const id = f?.id;
    if (!Number.isInteger(id) || id < 1 || frames.some((o) => o.id === id)) return null;
    frames.push({ id });
  }
  return frames;
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
      doc = PixelDocument.restore({
        width: s.width, height: s.height, frames: [{ id: 1 }], currentFrameId: 1, nextFrameId: 2,
        layers: [layer], activeId: 1, nextId: 2, fps: 8, onion: false,
      });
    } else if (s.version === 2 || s.version === 3) {
      if (!Array.isArray(s.layers) || s.layers.length < 1 || s.layers.length > MAX_LAYERS) return null;
      if (!Number.isInteger(s.activeId) || !Number.isInteger(s.nextId)) return null;
      let frames: Frame[];
      let currentFrameId: number;
      let nextFrameId: number;
      let fps = 8;
      let onion = false;
      if (s.version === 3) {
        const f = parseFrames(s.frames);
        if (!f) return null;
        if (!Number.isInteger(s.currentFrameId) || !Number.isInteger(s.nextFrameId)) return null;
        if (!Number.isInteger(s.fps) || s.fps < 1 || s.fps > 30) return null;
        if (typeof s.onion !== 'boolean') return null;
        frames = f;
        currentFrameId = s.currentFrameId;
        nextFrameId = s.nextFrameId;
        fps = s.fps;
        onion = s.onion;
      } else {
        frames = [{ id: 1 }];
        currentFrameId = 1;
        nextFrameId = 2;
      }
      if (s.width * s.height * s.layers.length * frames.length > MAX_PIXELS) return null;
      const frameIds = new Set(frames.map((f) => f.id));
      const layers: Layer[] = [];
      for (const r of s.layers) {
        const l = s.version === 3 ? parseLayerV3(r, length, frameIds) : parseLayerV2(r, length);
        if (!l || layers.some((o) => o.id === l.id)) return null;
        layers.push(l);
      }
      const nextId = Math.max(s.nextId, Math.max(...layers.map((l) => l.id)) + 1);
      doc = PixelDocument.restore({
        width: s.width, height: s.height, frames, currentFrameId, nextFrameId,
        layers, activeId: s.activeId, nextId, fps, onion,
      });
    } else {
      return null;
    }
    return { doc, palette: s.palette, color: s.color };
  } catch {
    return null;
  }
}
