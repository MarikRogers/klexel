import type { KvBackend, ProjectKind, ProjectMeta } from './types';

const INDEX = 'ws:index', LAST = 'ws:last';
const pKey = (id: string) => `ws:p:${id}`;

export function newProjectId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class WorkspaceStore {
  // Index-Änderungen laufen nacheinander, sonst überschreiben parallele Speichervorgänge einander
  private chain: Promise<unknown> = Promise.resolve();

  // Zuletzt vergebener Zeitstempel: neue und gesicherte Projekte bekommen streng wachsende Werte, auch in
  // derselben Millisekunde (sonst hängt die Reihenfolge der Liste vom Zufall der Uhr ab)
  private lastStamp = 0;

  constructor(private kv: KvBackend) {}

  private tick(atLeast = 0): number {
    this.lastStamp = Math.max(Date.now(), this.lastStamp + 1, atLeast + 1);
    return this.lastStamp;
  }

  private async readIndex(): Promise<ProjectMeta[]> {
    const v = await this.kv.get(INDEX);
    return Array.isArray(v) ? (v as ProjectMeta[]) : [];
  }

  private updateIndex<T>(fn: (idx: ProjectMeta[]) => T | Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const idx = await this.readIndex();
      const res = await fn(idx);
      await this.kv.set(INDEX, idx);
      return res;
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async list(): Promise<ProjectMeta[]> {
    await this.chain;
    // Bei gleichem Zeitstempel zuerst das später angelegte (Umkehr + stabile Sortierung)
    return (await this.readIndex()).reverse().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async create(kind: ProjectKind, name: string, payload: unknown): Promise<ProjectMeta> {
    const meta: ProjectMeta = { id: newProjectId(), kind, name, updatedAt: this.tick() };
    await this.kv.set(pKey(meta.id), payload);
    await this.updateIndex(idx => { idx.push(meta); });
    return { ...meta };
  }

  /** Legt ein Projekt mit neuer ID an und behält Art, Datum, Vorschau und Herkunft aus `src` (Dateiimport). */
  async add(src: Omit<ProjectMeta, 'id'>, payload: unknown, id: string = newProjectId()): Promise<ProjectMeta> {
    const meta: ProjectMeta = { ...src, id };
    await this.kv.set(pKey(meta.id), payload);
    await this.updateIndex(idx => { idx.push(meta); });
    return { ...meta };
  }

  async load(id: string): Promise<unknown | null> {
    const v = await this.kv.get(pKey(id));
    return v === undefined ? null : v;
  }

  /** Schreibt nur für bekannte Projekte; eine unbekannte oder inzwischen gelöschte ID ist ein No-op (kein verwaister Payload). */
  async save(id: string, payload: unknown, patch?: Partial<Pick<ProjectMeta, 'name' | 'thumbnail'>>): Promise<void> {
    // Prüfen und Schreiben im selben eingereihten Schritt, damit ein remove dazwischen nicht möglich ist
    await this.updateIndex(async idx => {
      const m = idx.find(x => x.id === id);
      if (!m) return;
      await this.kv.set(pKey(id), payload);
      if (patch?.name !== undefined) m.name = patch.name;
      if (patch?.thumbnail !== undefined) m.thumbnail = patch.thumbnail;
      // Streng wachsend (auch gegenüber allen zuvor vergebenen), damit die Sortierung nicht von der Uhr abhängt
      m.updatedAt = this.tick(m.updatedAt);
    });
  }

  async rename(id: string, name: string): Promise<void> {
    await this.updateIndex(idx => {
      const m = idx.find(x => x.id === id);
      if (m) m.name = name;
    });
  }

  async duplicate(id: string): Promise<ProjectMeta> {
    const src = (await this.list()).find(m => m.id === id);
    if (!src) throw new Error(`Projekt ${id} nicht gefunden`);
    const payload = await this.load(id);
    const meta: ProjectMeta = { ...src, id: newProjectId(), name: `${src.name} (Kopie)`, updatedAt: this.tick() };
    await this.kv.set(pKey(meta.id), payload);
    await this.updateIndex(idx => { idx.push(meta); });
    return { ...meta };
  }

  async remove(id: string): Promise<void> {
    await this.updateIndex(idx => {
      const i = idx.findIndex(x => x.id === id);
      if (i >= 0) idx.splice(i, 1);
    });
    // Erst aus dem Index, dann den Payload löschen; ein danach eingereihtes save ist ein No-op
    await this.kv.del(pKey(id));
    if ((await this.lastOpened()) === id) await this.setLastOpened(null);
  }

  async lastOpened(): Promise<string | null> {
    const v = await this.kv.get(LAST);
    return typeof v === 'string' ? v : null;
  }

  async setLastOpened(id: string | null): Promise<void> {
    if (id === null) await this.kv.del(LAST); else await this.kv.set(LAST, id);
  }
}
