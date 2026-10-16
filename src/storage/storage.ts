import { PixelDocument } from '../model/Document';
import { serializeState, parseState } from './state';

const DB = 'pixelart', STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function kv<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function saveState(doc: PixelDocument, palette: number[], color: number): Promise<void> {
  await kv('readwrite', st => st.put(serializeState(doc, palette, color), 'current'));
}

export async function loadState(): Promise<{ doc: PixelDocument; palette: number[]; color: number } | null> {
  try { return parseState(await kv<unknown>('readonly', st => st.get('current'))); } catch { return null; }
}

export function exportPng(doc: PixelDocument, scale: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = doc.width * scale; c.height = doc.height * scale;
  const small = document.createElement('canvas');
  small.width = doc.width; small.height = doc.height;
  const id = small.getContext('2d')!.createImageData(doc.width, doc.height);
  const pixels = doc.composite();
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    id.data[i * 4] = v >>> 24; id.data[i * 4 + 1] = (v >>> 16) & 255; id.data[i * 4 + 2] = (v >>> 8) & 255; id.data[i * 4 + 3] = v & 255;
  }
  small.getContext('2d')!.putImageData(id, 0, 0);
  const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('PNG fehlgeschlagen'))), 'image/png'));
}

export async function importPng(file: File): Promise<PixelDocument> {
  const bmp = await createImageBitmap(file);
  if (bmp.width > 128 || bmp.height > 128) throw new RangeError('Bild größer als 128×128');
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const doc = new PixelDocument(c.width, c.height);
  for (let i = 0; i < doc.data.length; i++) {
    doc.data[i] = ((id.data[i * 4] << 24) | (id.data[i * 4 + 1] << 16) | (id.data[i * 4 + 2] << 8) | id.data[i * 4 + 3]) >>> 0;
  }
  return doc;
}
