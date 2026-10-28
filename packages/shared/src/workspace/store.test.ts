import { describe, it, expect, vi, afterEach } from 'vitest';
import { WorkspaceStore } from './store';
import { MemoryBackend } from './memoryBackend';

const setup = () => { const kv = new MemoryBackend(); return { kv, ws: new WorkspaceStore(kv) }; };

describe('WorkspaceStore', () => {
  it('list liest nur den Index', async () => {
    const { kv, ws } = setup();
    await ws.create('klexel', 'A', { a: 1 });
    await ws.create('rigsprite', 'B', { b: 2 });
    kv.reads.length = 0;
    const l = await ws.list();
    expect(l).toHaveLength(2);
    expect(kv.reads.filter(k => k.startsWith('ws:p:'))).toHaveLength(0);
    expect(kv.reads).toContain('ws:index');
  });

  it('create und load: Round-Trip', async () => {
    const { ws } = setup();
    const m = await ws.create('klexel', 'A', { x: [1, 2] });
    expect(m.kind).toBe('klexel');
    expect(await ws.load(m.id)).toEqual({ x: [1, 2] });
    expect(await ws.load('nix')).toBeNull();
  });

  it('save aktualisiert updatedAt und sortiert nach vorn', async () => {
    const { ws } = setup();
    const a = await ws.create('klexel', 'A', 1);
    const b = await ws.create('klexel', 'B', 2);
    expect((await ws.list()).map(m => m.id)).toEqual([b.id, a.id]);
    await ws.save(a.id, 3, { name: 'A2', thumbnail: 'data:x' });
    const l = await ws.list();
    expect(l[0].id).toBe(a.id);
    expect(l[0].name).toBe('A2');
    expect(l[0].thumbnail).toBe('data:x');
    expect(l[0].updatedAt).toBeGreaterThan(a.updatedAt);
    expect(await ws.load(a.id)).toBe(3);
  });

  it('duplicate: neue ID, gleicher Payload, Kopie-Name', async () => {
    const { ws } = setup();
    const a = await ws.create('klexel', 'A', { p: 1 });
    const d = await ws.duplicate(a.id);
    expect(d.id).not.toBe(a.id);
    expect(d.name).toBe('A (Kopie)');
    expect(await ws.load(d.id)).toEqual({ p: 1 });
    expect(await ws.list()).toHaveLength(2);
  });

  it('remove löscht Index-Eintrag und Payload', async () => {
    const { kv, ws } = setup();
    const a = await ws.create('klexel', 'A', 1);
    await ws.setLastOpened(a.id);
    await ws.remove(a.id);
    expect(await ws.list()).toHaveLength(0);
    expect(kv.data.has(`ws:p:${a.id}`)).toBe(false);
    expect(await ws.lastOpened()).toBeNull();
  });

  it('rename und lastOpened', async () => {
    const { ws } = setup();
    const a = await ws.create('klexel', 'A', 1);
    await ws.rename(a.id, 'Neu');
    expect((await ws.list())[0].name).toBe('Neu');
    expect(await ws.lastOpened()).toBeNull();
    await ws.setLastOpened(a.id);
    expect(await ws.lastOpened()).toBe(a.id);
  });

  it('parallele save-Aufrufe verlieren keinen Index-Eintrag', async () => {
    const { ws } = setup();
    const a = await ws.create('klexel', 'A', 1);
    const b = await ws.create('rigsprite', 'B', 2);
    await Promise.all([ws.save(a.id, 10, { name: 'A!' }), ws.save(b.id, 20, { name: 'B!' })]);
    const l = await ws.list();
    expect(l.map(m => m.name).sort()).toEqual(['A!', 'B!']);
    expect(await ws.load(a.id)).toBe(10);
    expect(await ws.load(b.id)).toBe(20);
  });

  it('save auf unbekannte oder gelöschte ID schreibt nichts', async () => {
    const { kv, ws } = setup();
    await ws.save('nix', { x: 1 });
    expect(kv.data.has('ws:p:nix')).toBe(false);
    const a = await ws.create('klexel', 'A', 1);
    // Löschen und ein danach eingereihtes Speichern: kein verwaister Payload
    await Promise.all([ws.remove(a.id), ws.save(a.id, 2)]);
    expect(kv.data.has(`ws:p:${a.id}`)).toBe(false);
    expect(await ws.list()).toHaveLength(0);
  });

  it('parallele create-Aufrufe verlieren keinen Eintrag', async () => {
    const { ws } = setup();
    await Promise.all([ws.create('klexel', 'A', 1), ws.create('klexel', 'B', 2), ws.create('klexel', 'C', 3)]);
    expect(await ws.list()).toHaveLength(3);
  });

  describe('Zeitstempel', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('save rückt nach vorn, auch wenn die Uhr den Wert des zuletzt angelegten Projekts nur erreicht', async () => {
      const { ws } = setup();
      const now = vi.spyOn(Date, 'now');
      now.mockReturnValue(100);
      const a = await ws.create('klexel', 'A', 1);
      now.mockReturnValue(101);
      const b = await ws.create('klexel', 'B', 2);
      await ws.save(a.id, 3); // Uhr = 101 = updatedAt von B: früher Gleichstand, B blieb vorn
      expect((await ws.list()).map(m => m.id)).toEqual([a.id, b.id]);
    });

    it('laufen Uhr und Vergabe rückwärts oder gleich, wachsen die Werte trotzdem streng', async () => {
      const { ws } = setup();
      vi.spyOn(Date, 'now').mockReturnValue(500);
      const a = await ws.create('klexel', 'A', 1);
      const b = await ws.create('klexel', 'B', 2);
      const c = await ws.duplicate(a.id);
      expect(b.updatedAt).toBeGreaterThan(a.updatedAt);
      expect(c.updatedAt).toBeGreaterThan(b.updatedAt);
    });
  });

  it('add lehnt eine vorhandene ID ab und lässt das Projekt unberührt', async () => {
    const { ws } = setup();
    const a = await ws.create('klexel', 'A', { v: 1 });
    await expect(ws.add({ kind: 'klexel', name: 'X', updatedAt: 1 }, { v: 2 }, a.id)).rejects.toThrow();
    expect(await ws.load(a.id)).toEqual({ v: 1 });
    expect((await ws.list()).map(m => m.name)).toEqual(['A']);
    const b = await ws.add({ kind: 'klexel', name: 'B', updatedAt: 1 }, 5, 'feste-id');
    expect(b.id).toBe('feste-id');
    expect(await ws.load('feste-id')).toBe(5);
  });

  it('create und duplicate liegen vorn, auch wenn der Index schon höhere Zeitstempel hat', async () => {
    const kv = new MemoryBackend();
    const future = Date.now() + 100000; // einmal festhalten: sonst wandert die Schwelle mit der Uhr (unzuverlässig)
    kv.data.set('ws:index', [{ id: 'alt', kind: 'klexel', name: 'Alt', updatedAt: future }]);
    kv.data.set('ws:p:alt', 1);
    const ws = new WorkspaceStore(kv);
    const n = await ws.create('klexel', 'Neu', 2);
    expect(n.updatedAt).toBeGreaterThan(future);
    const d = await ws.duplicate('alt');
    expect(d.updatedAt).toBeGreaterThan(n.updatedAt);
    expect((await ws.list()).map(m => m.name)).toEqual(['Alt (Kopie)', 'Neu', 'Alt']);
  });
});
