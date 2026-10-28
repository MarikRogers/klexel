import type { ProjectKind, ProjectMeta } from './types';
import type { WorkspaceStore } from './store';

export interface WorkspaceFile {
  format: 'klexel-workspace';
  version: 1;
  projects: Array<{ kind: string; name: string; updatedAt: number; thumbnail?: string; origin?: ProjectMeta['origin']; payload: unknown }>;
}

export interface ImportResult {
  added: ProjectMeta[];
  rejected: Array<{ name: string; reason: string }>;
}

const FORMAT = 'klexel-workspace';
const TAG = '$typed';
const CHUNK = 0x8000;

const ARRAYS: Record<string, new (buf: ArrayBuffer) => ArrayBufferView> = {
  Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array,
  Float32Array, Float64Array,
};

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  return btoa(s);
}

function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Typed Arrays gehen nicht durch JSON: als { $typed, b64 } (Bytes in Systemreihenfolge, praktisch little-endian) sichern
function replacer(_key: string, value: unknown): unknown {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const name = value.constructor.name;
    if (name in ARRAYS) {
      return { [TAG]: name, b64: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    }
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && typeof (value as Record<string, unknown>)[TAG] === 'string') {
    const o = value as Record<string, unknown>;
    const Ctor = ARRAYS[o[TAG] as string];
    if (Ctor && typeof o.b64 === 'string') return new Ctor(fromBase64(o.b64));
  }
  return value;
}

/** Sichert alle (oder die genannten) Projekte als JSON-Datei. */
export async function exportWorkspace(store: WorkspaceStore, ids?: string[]): Promise<Blob> {
  const metas = (await store.list()).filter(m => !ids || ids.includes(m.id));
  const projects: WorkspaceFile['projects'] = [];
  for (const m of metas) {
    const p: WorkspaceFile['projects'][number] = { kind: m.kind, name: m.name, updatedAt: m.updatedAt, payload: await store.load(m.id) };
    if (m.thumbnail !== undefined) p.thumbnail = m.thumbnail;
    if (m.origin !== undefined) p.origin = m.origin;
    projects.push(p);
  }
  const file: WorkspaceFile = { format: FORMAT, version: 1, projects };
  return new Blob([JSON.stringify(file, replacer)], { type: 'application/json' });
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Fügt die Projekte der Datei mit neuen IDs hinzu (ersetzt nie etwas). Wirft bei unlesbarer oder zu neuer Datei,
 * ohne den Speicher anzurühren. Einzelne fehlerhafte Projekte landen in `rejected`.
 */
export async function importWorkspace(
  store: WorkspaceStore,
  text: string,
  isKnownKind: (kind: string) => boolean,
  validatePayload?: (kind: string, payload: unknown) => boolean,
): Promise<ImportResult> {
  let data: unknown;
  try { data = JSON.parse(text, reviver); } catch { throw new Error('Die Datei ist keine gültige Workspace-Datei'); }
  if (!isObj(data) || data.format !== FORMAT || typeof data.version !== 'number' || !Array.isArray(data.projects)) {
    throw new Error('Die Datei ist keine gültige Workspace-Datei');
  }
  if (data.version > 1) throw new Error('Die Datei stammt von einer neueren Version');
  const added: ProjectMeta[] = [];
  const rejected: ImportResult['rejected'] = [];
  for (const raw of data.projects as unknown[]) {
    const name = isObj(raw) && typeof raw.name === 'string' ? raw.name : 'Unbenannt';
    const reason = check(raw, isKnownKind, validatePayload);
    if (reason) { rejected.push({ name, reason }); continue; }
    const p = raw as WorkspaceFile['projects'][number];
    const meta: Omit<ProjectMeta, 'id'> = {
      kind: p.kind as ProjectKind,
      name: p.name,
      updatedAt: typeof p.updatedAt === 'number' && isFinite(p.updatedAt) ? p.updatedAt : Date.now(),
    };
    if (typeof p.thumbnail === 'string') meta.thumbnail = p.thumbnail;
    if (isObj(p.origin) && typeof p.origin.rigProjectId === 'string' && typeof p.origin.animationId === 'string') {
      meta.origin = { rigProjectId: p.origin.rigProjectId, animationId: p.origin.animationId };
    }
    added.push(await store.add(meta, p.payload));
  }
  return { added, rejected };
}

function check(raw: unknown, isKnownKind: (k: string) => boolean, validate?: (k: string, p: unknown) => boolean): string | null {
  if (!isObj(raw)) return 'Eintrag ist kein Projekt';
  if (typeof raw.kind !== 'string' || !raw.kind) return 'Art fehlt oder ist ungültig';
  if (typeof raw.name !== 'string') return 'Name fehlt oder ist ungültig';
  if (!('payload' in raw) || raw.payload === undefined) return 'Inhalt fehlt';
  if (isKnownKind(raw.kind) && validate && !validate(raw.kind, raw.payload)) return 'Inhalt ist nicht lesbar';
  return null;
}
