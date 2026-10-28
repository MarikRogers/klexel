import type { KvBackend } from './types';

const DB = 'klexel-workspace', STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

// Verbindung wiederverwenden (wie src/storage/storage.ts)
function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => {
      const db = r.result;
      db.onclose = db.onversionchange = () => { db.close(); if (dbPromise === p) dbPromise = null; };
      res(db);
    };
    r.onerror = () => rej(r.error);
  });
  dbPromise = p;
  p.catch(() => { if (dbPromise === p) dbPromise = null; });
  return p;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export class IdbBackend implements KvBackend {
  get(key: string): Promise<unknown> { return run('readonly', s => s.get(key)); }
  async set(key: string, value: unknown): Promise<void> { await run('readwrite', s => s.put(value, key)); }
  async del(key: string): Promise<void> { await run('readwrite', s => s.delete(key)); }
}
