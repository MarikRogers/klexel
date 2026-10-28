import { describe, it, expect } from 'vitest';
import { WorkspaceStore } from './store';
import { MemoryBackend } from './memoryBackend';
import { exportWorkspace, importWorkspace } from './file';
import type { ProjectKind } from './types';

const known = (k: string) => k === 'klexel' || k === 'rigsprite';
const mk = () => new WorkspaceStore(new MemoryBackend());
const text = (b: Blob) => b.text();

describe('Workspace-Datei', () => {
  it('Export und Import in leeren Store: gleiche Namen und Payloads, neue IDs', async () => {
    const a = mk();
    const m1 = await a.create('klexel', 'Eins', { cels: [new Uint32Array([1, 2, 3])], n: 5 });
    await a.create('rigsprite', 'Zwei', { x: 'y' });
    const b = mk();
    const r = await importWorkspace(b, await text(await exportWorkspace(a)), known);
    expect(r.rejected).toEqual([]);
    expect(r.added).toHaveLength(2);
    const list = await b.list();
    expect(list.map(m => m.name).sort()).toEqual(['Eins', 'Zwei']);
    const eins = list.find(m => m.name === 'Eins')!;
    expect(eins.id).not.toBe(m1.id);
    expect(await b.load(eins.id)).toEqual({ cels: [new Uint32Array([1, 2, 3])], n: 5 });
  });

  it('Import mit gleichem Namen fügt hinzu und ersetzt nichts', async () => {
    const a = mk();
    await a.create('klexel', 'Eins', { v: 1 });
    const t = await text(await exportWorkspace(a));
    await importWorkspace(a, t, known);
    const list = await a.list();
    expect(list).toHaveLength(2);
    expect(new Set(list.map(m => m.id)).size).toBe(2);
  });

  it('Export einzelner Projekte per ids', async () => {
    const a = mk();
    await a.create('klexel', 'Eins', 1);
    const m2 = await a.create('klexel', 'Zwei', 2);
    const f = JSON.parse(await text(await exportWorkspace(a, [m2.id])));
    expect(f.format).toBe('klexel-workspace');
    expect(f.version).toBe(1);
    expect(f.projects.map((p: { name: string }) => p.name)).toEqual(['Zwei']);
  });

  it('kaputte JSON-Datei: Fehlermeldung, Store unverändert', async () => {
    const a = mk();
    await a.create('klexel', 'Eins', 1);
    await expect(importWorkspace(a, '{kaputt', known)).rejects.toThrow(/Datei/);
    await expect(importWorkspace(a, JSON.stringify({ format: 'anders' }), known)).rejects.toThrow(/Datei/);
    expect(await a.list()).toHaveLength(1);
  });

  it('ein kaputtes und zwei gute Projekte: zwei hinzugefügt, eines abgelehnt', async () => {
    const a = mk();
    const file = { format: 'klexel-workspace', version: 1, projects: [
      { kind: 'klexel', name: 'A', updatedAt: 1, payload: { a: 1 } },
      { kind: 'klexel', name: 42, updatedAt: 1, payload: {} },
      { kind: 'klexel', name: 'C', updatedAt: 1, payload: { c: 1 } },
    ] };
    const r = await importWorkspace(a, JSON.stringify(file), known);
    expect(r.added.map(m => m.name)).toEqual(['A', 'C']);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toBeTruthy();
    expect(await a.list()).toHaveLength(2);
  });

  it('validatePayload lehnt bekannte Arten ab, unbekannte nicht', async () => {
    const a = mk();
    const file = { format: 'klexel-workspace', version: 1, projects: [
      { kind: 'klexel', name: 'Schlecht', updatedAt: 1, payload: { bad: true } },
      { kind: 'klexel', name: 'Gut', updatedAt: 1, payload: { ok: true } },
      { kind: 'neu', name: 'Fremd', updatedAt: 1, payload: { bad: true } },
    ] };
    const r = await importWorkspace(a, JSON.stringify(file), known, (_k, p) => !(p as { bad?: boolean }).bad || false);
    expect(r.added.map(m => m.name)).toEqual(['Gut', 'Fremd']);
    expect(r.rejected.map(x => x.name)).toEqual(['Schlecht']);
  });

  it('unbekannte Art bleibt erhalten und überlebt Export/Import', async () => {
    const a = mk();
    const file = { format: 'klexel-workspace', version: 1, projects: [
      { kind: 'zukunft', name: 'Z', updatedAt: 7, thumbnail: 'data:x', payload: { q: [1] } },
    ] };
    const r = await importWorkspace(a, JSON.stringify(file), () => false);
    expect(r.added[0].kind).toBe('zukunft');
    const b = mk();
    await importWorkspace(b, await text(await exportWorkspace(a)), () => false);
    const [m] = await b.list();
    expect(m.kind).toBe('zukunft' as ProjectKind);
    expect(m.updatedAt).toBe(7);
    expect(m.thumbnail).toBe('data:x');
    expect(await b.load(m.id)).toEqual({ q: [1] });
  });

  it('höhere Version: verständliche Meldung', async () => {
    const a = mk();
    await expect(importWorkspace(a, JSON.stringify({ format: 'klexel-workspace', version: 2, projects: [] }), known))
      .rejects.toThrow('Die Datei stammt von einer neueren Version');
    expect(await a.list()).toHaveLength(0);
  });

  it('Typed Arrays: verschachtelt, leer und groß', async () => {
    const a = mk();
    const big = new Uint32Array(1_000_000);
    for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) >>> 0;
    const payload = { frames: [{ cels: [new Uint32Array(0), new Uint32Array([0xffffffff, 0])] }], big, f: new Float32Array([1.5]) };
    await a.create('klexel', 'T', payload);
    const b = mk();
    await importWorkspace(b, await text(await exportWorkspace(a)), known);
    const out = (await b.load((await b.list())[0].id)) as typeof payload;
    expect(out.frames[0].cels[0]).toBeInstanceOf(Uint32Array);
    expect(out.frames[0].cels[0].length).toBe(0);
    expect(Array.from(out.frames[0].cels[1])).toEqual([0xffffffff, 0]);
    expect(out.big).toBeInstanceOf(Uint32Array);
    expect(out.big.length).toBe(1_000_000);
    expect(out.big.every((v, i) => v === big[i])).toBe(true);
    expect(out.f).toBeInstanceOf(Float32Array);
  });
});
