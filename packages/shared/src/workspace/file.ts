import type { ProjectKind, ProjectMeta } from './types';
import { newProjectId, type WorkspaceStore } from './store';

export interface WorkspaceFile {
  format: 'klexel-workspace';
  version: 1;
  projects: Array<{ id?: string; kind: string; name: string; updatedAt: number; thumbnail?: string; origin?: ProjectMeta['origin']; payload: unknown }>;
}

export interface ImportResult {
  added: ProjectMeta[];
  rejected: Array<{ name: string; reason: string }>;
}

const FORMAT = 'klexel-workspace';
const TAG = '$typed';
const ESC = '$escaped';
const CHUNK = 0x8000;
const MAX_NAME = 60, MAX_KIND = 32, MAX_THUMB = 200_000;
const THUMB_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// Whitelist; der Typ wird per instanceof bestimmt (nicht per constructor.name)
const TYPES: Array<[string, { new (buf: ArrayBuffer): ArrayBufferView; BYTES_PER_ELEMENT: number }]> = [
  ['Int8Array', Int8Array], ['Uint8Array', Uint8Array], ['Uint8ClampedArray', Uint8ClampedArray],
  ['Int16Array', Int16Array], ['Uint16Array', Uint16Array], ['Int32Array', Int32Array], ['Uint32Array', Uint32Array],
  ['Float32Array', Float32Array], ['Float64Array', Float64Array],
];

/** Platzhalter für einen nicht lesbaren Typed-Array-Eintrag; macht nur das betroffene Projekt unlesbar. */
class Bad { }

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  return btoa(s);
}

function fromBase64(b64: string): ArrayBuffer | null {
  if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  } catch { return null; }
}

// Typed Arrays gehen nicht durch JSON: als { $typed, b64 } (Bytes in Systemreihenfolge, praktisch little-endian) sichern.
// Echte Objekte mit Schlüssel $typed/$escaped werden als { $escaped: [[Schlüssel, Wert], ...] } maskiert.
function replacer(_key: string, value: unknown): unknown {
  if (ArrayBuffer.isView(value)) {
    for (const [name, Ctor] of TYPES) {
      if (value instanceof Ctor) return { [TAG]: name, b64: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    }
    throw new Error('Dieser Datentyp lässt sich nicht in einer Datei sichern');
  }
  if (isObj(value) && (Object.hasOwn(value, TAG) || Object.hasOwn(value, ESC))) {
    return { [ESC]: Object.entries(value) };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (!isObj(value)) return value;
  if (Object.hasOwn(value, ESC) && Array.isArray(value[ESC])) {
    const out: Record<string, unknown> = {};
    for (const e of value[ESC] as unknown[]) {
      if (Array.isArray(e) && typeof e[0] === 'string') Object.defineProperty(out, e[0], { value: e[1], enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  if (typeof value[TAG] === 'string') {
    const t = TYPES.find(x => x[0] === value[TAG]);
    const buf = t && typeof value.b64 === 'string' ? fromBase64(value.b64) : null;
    if (!t || !buf || buf.byteLength % t[1].BYTES_PER_ELEMENT !== 0) return new Bad();
    return new t[1](buf);
  }
  return value;
}

function hasBad(root: unknown): boolean {
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (v instanceof Bad) return true;
    if (ArrayBuffer.isView(v) || !v || typeof v !== 'object') continue;
    for (const c of Object.values(v)) stack.push(c);
  }
  return false;
}

/** Sichert alle (oder die genannten) Projekte als JSON-Datei. */
export async function exportWorkspace(store: WorkspaceStore, ids?: string[]): Promise<Blob> {
  const metas = (await store.list()).filter(m => !ids || ids.includes(m.id));
  const projects: WorkspaceFile['projects'] = [];
  for (const m of metas) {
    const p: WorkspaceFile['projects'][number] = { id: m.id, kind: m.kind, name: m.name, updatedAt: m.updatedAt, payload: await store.load(m.id) };
    if (m.thumbnail !== undefined) p.thumbnail = m.thumbnail;
    if (m.origin !== undefined) p.origin = m.origin;
    projects.push(p);
  }
  const file: WorkspaceFile = { format: FORMAT, version: 1, projects };
  return new Blob([JSON.stringify(file, replacer)], { type: 'application/json' });
}

/**
 * Fügt die Projekte der Datei mit neuen IDs hinzu (ersetzt nie etwas). Wirft bei unlesbarer oder zu neuer Datei,
 * ohne den Speicher anzurühren. Einzelne fehlerhafte Projekte landen in `rejected`.
 */
export async function importWorkspace(
  store: WorkspaceStore,
  text: string,
  isKnownKind: (kind: string) => boolean,
  validatePayload?: (kind: string, payload: unknown) => boolean,
  remapPayload?: (kind: string, payload: unknown, idMap: ReadonlyMap<string, string>) => unknown,
): Promise<ImportResult> {
  let data: unknown;
  try { data = JSON.parse(text, reviver); } catch { throw new Error('Die Datei ist keine gültige Workspace-Datei'); }
  if (!isObj(data) || data.format !== FORMAT || typeof data.version !== 'number' || !Array.isArray(data.projects)) {
    throw new Error('Die Datei ist keine gültige Workspace-Datei');
  }
  if (data.version > 1) throw new Error('Die Datei stammt von einer neueren Version');
  const rejected: ImportResult['rejected'] = [];
  // Erster Durchgang: gültige Projekte und ihre neuen IDs; idMap (alte → neue ID) dient dem Umschreiben von Verknüpfungen
  const idMap = new Map<string, string>();
  const valid: Array<{ p: WorkspaceFile['projects'][number]; name: string; newId: string }> = [];
  for (const raw of data.projects as unknown[]) {
    const name = cleanName(isObj(raw) ? raw.name : undefined);
    const reason = check(raw, isKnownKind, validatePayload);
    if (reason) { rejected.push({ name, reason }); continue; }
    const p = raw as WorkspaceFile['projects'][number];
    const newId = newProjectId();
    // Doppelte alte ID in einer Datei: die erste gilt, die weiteren bekommen keinen Eintrag
    if (typeof p.id === 'string' && p.id && !idMap.has(p.id)) idMap.set(p.id, newId);
    valid.push({ p, name, newId });
  }
  // Zweiter Durchgang: Verknüpfungen umschreiben und speichern
  const added: ProjectMeta[] = [];
  for (const { p, name, newId } of valid) {
    const meta: Omit<ProjectMeta, 'id'> = {
      kind: p.kind as ProjectKind,
      name,
      updatedAt: typeof p.updatedAt === 'number' && isFinite(p.updatedAt) ? p.updatedAt : Date.now(),
    };
    if (typeof p.thumbnail === 'string' && p.thumbnail.length <= MAX_THUMB && THUMB_RE.test(p.thumbnail)) meta.thumbnail = p.thumbnail;
    if (isObj(p.origin) && typeof p.origin.rigProjectId === 'string' && typeof p.origin.animationId === 'string') {
      meta.origin = { rigProjectId: idMap.get(p.origin.rigProjectId) ?? p.origin.rigProjectId, animationId: p.origin.animationId };
    }
    let payload: unknown;
    try { payload = remapPayload ? remapPayload(p.kind, p.payload, idMap) ?? p.payload : p.payload; } catch { rejected.push({ name, reason: 'Verknüpfungen nicht lesbar' }); continue; }
    try { added.push(await store.add(meta, payload, newId)); } catch (err) { rejected.push({ name, reason: err instanceof Error ? err.message : 'Speichern fehlgeschlagen' }); }
  }
  return { added, rejected };
}

export function cleanName(v: unknown): string {
  return (typeof v === 'string' ? v.trim() : '').slice(0, MAX_NAME).trim() || 'Unbenannt';
}

function check(raw: unknown, isKnownKind: (k: string) => boolean, validate?: (k: string, p: unknown) => boolean): string | null {
  if (!isObj(raw)) return 'Eintrag ist kein Projekt';
  if (typeof raw.kind !== 'string' || !raw.kind || raw.kind.length > MAX_KIND) return 'Art fehlt oder ist ungültig';
  if (typeof raw.name !== 'string') return 'Name fehlt oder ist ungültig';
  if (!('payload' in raw) || raw.payload === undefined) return 'Inhalt fehlt';
  if (hasBad(raw.payload)) return 'Inhalt ist nicht lesbar';
  if (isKnownKind(raw.kind) && validate && !validate(raw.kind, raw.payload)) return 'Inhalt ist nicht lesbar';
  return null;
}
