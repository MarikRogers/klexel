import { describe, it, expect, vi } from 'vitest';
import { WorkspaceStore } from './store';
import { MemoryBackend } from './memoryBackend';
import { migrateLegacy } from './migrateLegacy';

const setup = () => { const kv = new MemoryBackend(); return { kv, ws: new WorkspaceStore(kv) }; };

describe('migrateLegacy', () => {
  it('übernimmt vorhandenen Alt-Stand als Projekt "Mein Bild"', async () => {
    const { kv, ws } = setup();
    const legacy = { v: 1, w: 2 };
    expect(await migrateLegacy(ws, kv, async () => legacy)).toBe('migrated');
    const list = await ws.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Mein Bild', kind: 'klexel' });
    expect(await ws.load(list[0].id)).toEqual(legacy);
    expect(await ws.lastOpened()).toBe(list[0].id);
    expect(await kv.get('ws:migrated')).toBeTruthy();
  });

  it('zweiter Aufruf legt kein zweites Projekt an', async () => {
    const { kv, ws } = setup();
    await migrateLegacy(ws, kv, async () => ({ a: 1 }));
    expect(await migrateLegacy(ws, kv, async () => ({ a: 1 }))).toBe('done-before');
    expect(await ws.list()).toHaveLength(1);
  });

  it('ohne Alt-Stand: none und kein Marker', async () => {
    const { kv, ws } = setup();
    expect(await migrateLegacy(ws, kv, async () => null)).toBe('none');
    expect(await kv.get('ws:migrated')).toBeUndefined();
    expect(await migrateLegacy(ws, kv, async () => ({ a: 1 }))).toBe('migrated');
  });

  it('liest den Alt-Eintrag nur (genau ein Lesezugriff)', async () => {
    const { kv, ws } = setup();
    const read = vi.fn(async () => ({ a: 1 }));
    await migrateLegacy(ws, kv, read);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('Fehler bei setLastOpened erzeugt beim Wiederholen kein Duplikat', async () => {
    const kv = new MemoryBackend();
    const origSet = kv.set.bind(kv);
    let fail = true;
    kv.set = async (k: string, v: unknown) => {
      if (k === 'ws:last' && fail) { fail = false; throw new Error('boom'); }
      return origSet(k, v);
    };
    const ws = new WorkspaceStore(kv);
    await expect(migrateLegacy(ws, kv, async () => ({ a: 1 }))).rejects.toThrow('boom');
    expect(await migrateLegacy(ws, kv, async () => ({ a: 1 }))).toBe('done-before');
    expect(await ws.list()).toHaveLength(1);
  });

  it('Fehler bei create setzt keinen Marker, Wiederholen migriert', async () => {
    const kv = new MemoryBackend();
    const origSet = kv.set.bind(kv);
    let fail = true;
    kv.set = async (k: string, v: unknown) => {
      if (k.startsWith('ws:p:') && fail) { fail = false; throw new Error('boom'); }
      return origSet(k, v);
    };
    const ws = new WorkspaceStore(kv);
    await expect(migrateLegacy(ws, kv, async () => ({ a: 1 }))).rejects.toThrow('boom');
    expect(await kv.get('ws:migrated')).toBeUndefined();
    expect(await migrateLegacy(ws, kv, async () => ({ a: 1 }))).toBe('migrated');
    expect(await ws.list()).toHaveLength(1);
  });
});
