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
      { kind: 'zukunft', name: 'Z', updatedAt: 7, thumbnail: 'data:image/png;base64,AAAA', payload: { q: [1] } },
    ] };
    const r = await importWorkspace(a, JSON.stringify(file), () => false);
    expect(r.added[0].kind).toBe('zukunft');
    const b = mk();
    await importWorkspace(b, await text(await exportWorkspace(a)), () => false);
    const [m] = await b.list();
    expect(m.kind).toBe('zukunft' as ProjectKind);
    expect(m.updatedAt).toBe(7);
    expect(m.thumbnail).toBe('data:image/png;base64,AAAA');
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

describe('Workspace-Datei: Robustheit', () => {
  const entry = (name: string, payload: unknown, extra: object = {}) => ({ kind: 'klexel', name, updatedAt: 1, payload, ...extra });
  const file = (projects: unknown[]) => JSON.stringify({ format: 'klexel-workspace', version: 1, projects });

  it.each([
    ['ungültiges Base64', { $typed: 'Uint32Array', b64: '!!!!' }],
    ['5 Bytes für Uint32Array', { $typed: 'Uint32Array', b64: btoa('abcde') }],
    ['unbekannter Typ', { $typed: 'Foo', b64: 'AAAA' }],
  ])('%s: nur dieses Projekt abgelehnt', async (_n, bad) => {
    const a = mk();
    const r = await importWorkspace(a, file([entry('A', { v: 1 }), entry('Kaputt', { deep: [{ x: bad }] }), entry('C', { v: 3 })]), known);
    expect(r.added.map(m => m.name)).toEqual(['A', 'C']);
    expect(r.rejected).toEqual([{ name: 'Kaputt', reason: 'Inhalt ist nicht lesbar' }]);
  });

  it('BigInt64Array wird beim Export abgelehnt', async () => {
    const a = mk();
    await a.create('klexel', 'B', { b: new BigInt64Array(2) });
    await expect(exportWorkspace(a)).rejects.toThrow();
  });

  it('Objekte mit $typed/$escaped-Schlüssel überstehen den Round-Trip', async () => {
    const a = mk();
    const payload = { o: { $typed: 'Uint32Array', b64: 'AAAA' }, e: { $escaped: [1, 2], z: new Uint8Array([9]) } };
    await a.create('klexel', 'K', payload);
    const b = mk();
    await importWorkspace(b, await text(await exportWorkspace(a)), known);
    expect(await b.load((await b.list())[0].id)).toEqual(payload);
  });

  it('subarray-View wird nur mit seinem Ausschnitt gesichert', async () => {
    const a = mk();
    await a.create('klexel', 'S', { v: new Uint32Array([1, 2, 3, 4]).subarray(1, 3) });
    const b = mk();
    await importWorkspace(b, await text(await exportWorkspace(a)), known);
    const out = (await b.load((await b.list())[0].id)) as { v: Uint32Array };
    expect(Array.from(out.v)).toEqual([2, 3]);
  });

  it('Vorschaubild: nur PNG/JPEG/WebP-Data-URL bleibt', async () => {
    const a = mk();
    await importWorkspace(a, file([
      entry('http', 1, { thumbnail: 'http://evil/x.png' }),
      entry('svg', 1, { thumbnail: 'data:image/svg+xml;base64,PHN2Zz4=' }),
      entry('gross', 1, { thumbnail: 'data:image/png;base64,' + 'A'.repeat(200_001) }),
      entry('png', 1, { thumbnail: 'data:image/png;base64,iVBORw0KGgo=' }),
    ]), known);
    const list = await a.list();
    expect(list).toHaveLength(4);
    expect(list.filter(m => m.thumbnail).map(m => m.name)).toEqual(['png']);
  });

  it('Name wird bereinigt, zu lange Art abgelehnt, Doppelte bleiben doppelt', async () => {
    const a = mk();
    const r = await importWorkspace(a, file([
      entry('  ', 1), entry('x'.repeat(100), 1), entry('D', 1), entry('D', 1),
      { ...entry('Z', 1), kind: 'k'.repeat(33) },
    ]), known);
    expect(r.added.map(m => m.name)).toEqual(['Unbenannt', 'x'.repeat(60), 'D', 'D']);
    expect(r.rejected).toHaveLength(1);
  });
});

describe('Workspace-Datei: Verknüpfungen beim Laden umschreiben', () => {
  type Pl = { images?: Record<string, { source: { projectId: string } }>; n?: number; data?: Uint8Array };
  // Stand-in für den Rigsprite-Descriptor: schreibt images[*].source.projectId um
  const remap = (kind: string, payload: unknown, idMap: ReadonlyMap<string, string>): unknown => {
    if (kind !== 'rigsprite') return payload;
    const pl = payload as Pl;
    const images: NonNullable<Pl['images']> = {};
    for (const [k, im] of Object.entries(pl.images ?? {})) images[k] = { source: { projectId: idMap.get(im.source.projectId) ?? im.source.projectId } };
    return { ...pl, images };
  };
  const src = async () => {
    const a = mk();
    const A = await a.create('klexel', 'A', { n: 1 });
    const B = await a.create('rigsprite', 'B', { images: { x: { source: { projectId: A.id } }, y: { source: { projectId: 'fremd' } } }, data: new Uint8Array([7, 8]) });
    return { a, A, B };
  };

  it('B verweist nach dem Import auf das neue A; fremde Verknüpfung und Typed Arrays bleiben', async () => {
    const { a, A, B } = await src();
    const dst = mk();
    const r = await importWorkspace(dst, await text(await exportWorkspace(a)), known, undefined, remap);
    expect(r.rejected).toEqual([]);
    const list = await dst.list();
    const nA = list.find(m => m.name === 'A')!, nB = list.find(m => m.name === 'B')!;
    expect(nA.id).not.toBe(A.id);
    expect(nB.id).not.toBe(B.id);
    const pl = (await dst.load(nB.id)) as Pl;
    expect(pl.images!.x.source.projectId).toBe(nA.id);
    expect(pl.images!.y.source.projectId).toBe('fremd');
    expect(pl.data).toEqual(new Uint8Array([7, 8]));
  });

  it('origin.rigProjectId wird umgeschrieben, unbekannte bleibt', async () => {
    const a = mk();
    const rig = await a.create('rigsprite', 'Rig', {});
    const doc = await a.add({ kind: 'klexel', name: 'Doc', updatedAt: 1, origin: { rigProjectId: rig.id, animationId: 'an' } }, {});
    await a.add({ kind: 'klexel', name: 'Doc2', updatedAt: 2, origin: { rigProjectId: 'weg', animationId: 'an' } }, {});
    expect(doc.origin).toBeDefined();
    const dst = mk();
    await importWorkspace(dst, await text(await exportWorkspace(a)), known);
    const list = await dst.list();
    const nRig = list.find(m => m.name === 'Rig')!;
    expect(list.find(m => m.name === 'Doc')!.origin).toEqual({ rigProjectId: nRig.id, animationId: 'an' });
    expect(list.find(m => m.name === 'Doc2')!.origin).toEqual({ rigProjectId: 'weg', animationId: 'an' });
  });

  it('Datei ohne ids (ältere Ausgabe) lässt sich laden, ohne Umschreiben', async () => {
    const { a, A } = await src();
    const f = JSON.parse(await text(await exportWorkspace(a)));
    for (const p of f.projects) delete p.id;
    const dst = mk();
    const r = await importWorkspace(dst, JSON.stringify(f), known, undefined, remap);
    expect(r.added).toHaveLength(2);
    const nB = (await dst.list()).find(m => m.name === 'B')!;
    expect(((await dst.load(nB.id)) as Pl).images!.x.source.projectId).toBe(A.id);
  });

  it('doppelte ID: die erste gilt, kein Absturz', async () => {
    const f = { format: 'klexel-workspace', version: 1, projects: [
      { id: 'd', kind: 'klexel', name: 'Erste', updatedAt: 1, payload: {} },
      { id: 'd', kind: 'klexel', name: 'Zweite', updatedAt: 2, payload: {} },
      { id: 'r', kind: 'rigsprite', name: 'R', updatedAt: 3, payload: { images: { x: { source: { projectId: 'd' } } } } },
    ] };
    const dst = mk();
    const r = await importWorkspace(dst, JSON.stringify(f), known, undefined, remap);
    expect(r.added).toHaveLength(3);
    const list = await dst.list();
    const erste = list.find(m => m.name === 'Erste')!;
    expect(new Set(list.map(m => m.id)).size).toBe(3);
    expect(((await dst.load(list.find(m => m.name === 'R')!.id)) as Pl).images!.x.source.projectId).toBe(erste.id);
  });

  it('abgelehntes Projekt dazwischen stört nicht und steht nicht in der Zuordnung', async () => {
    const f = { format: 'klexel-workspace', version: 1, projects: [
      { id: 'a', kind: 'klexel', name: 'A', updatedAt: 1, payload: {} },
      { id: 'kaputt', kind: 'klexel', name: 'Kaputt', updatedAt: 2, payload: { $typed: 'Uint8Array', b64: '!!' } },
      { id: 'r', kind: 'rigsprite', name: 'R', updatedAt: 3, payload: { images: { x: { source: { projectId: 'a' } }, y: { source: { projectId: 'kaputt' } } } } },
    ] };
    const dst = mk();
    const seen: ReadonlyMap<string, string>[] = [];
    const r = await importWorkspace(dst, JSON.stringify(f), known, undefined, (k, p, m) => { seen.push(m); return remap(k, p, m); });
    expect(r.rejected.map(x => x.name)).toEqual(['Kaputt']);
    expect(r.added).toHaveLength(2);
    expect(seen[0].has('kaputt')).toBe(false);
    const list = await dst.list();
    const nR = list.find(m => m.name === 'R')!;
    const pl = (await dst.load(nR.id)) as Pl;
    expect(pl.images!.x.source.projectId).toBe(list.find(m => m.name === 'A')!.id);
    expect(pl.images!.y.source.projectId).toBe('kaputt');
  });

  it('remapPayload wirft für Projekt 2 von 3: die anderen werden übernommen, eines abgelehnt', async () => {
    const f = { format: 'klexel-workspace', version: 1, projects: ['Eins', 'Zwei', 'Drei'].map((n, i) => ({ id: `i${i}`, kind: 'klexel', name: n, updatedAt: i, payload: { i } })) };
    const dst = mk();
    const r = await importWorkspace(dst, JSON.stringify(f), known, undefined, (_k, p) => { if ((p as { i: number }).i === 1) throw new TypeError('kaputt'); return p; });
    expect(r.added.map(m => m.name)).toEqual(['Eins', 'Drei']);
    expect(r.rejected).toEqual([{ name: 'Zwei', reason: 'Verknüpfungen nicht lesbar' }]);
    expect(await dst.list()).toHaveLength(2);
  });

  it('Speicherfehler bei einem Projekt (z. B. vergebene ID) lehnt nur dieses ab', async () => {
    const f = { format: 'klexel-workspace', version: 1, projects: ['Eins', 'Zwei'].map((n, i) => ({ id: `i${i}`, kind: 'klexel', name: n, updatedAt: i, payload: i })) };
    const dst = mk();
    const orig = dst.add.bind(dst);
    let n = 0;
    dst.add = (...a: Parameters<typeof orig>) => (n++ === 0 ? Promise.reject(new Error('Projekt-ID x ist schon vergeben')) : orig(...a));
    const r = await importWorkspace(dst, JSON.stringify(f), known);
    expect(r.rejected).toEqual([{ name: 'Eins', reason: 'Projekt-ID x ist schon vergeben' }]);
    expect(r.added.map(m => m.name)).toEqual(['Zwei']);
  });
});
