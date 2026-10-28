import { CHANNELS, DEPTH_CHANNELS, EASINGS, type Animation, type BoneTrack, type Easing, type Keyframe } from './animation';
import { DEFAULT_PROJECT_NAME, DEFAULT_SETTINGS, MIN_SOFTNESS } from './defaults';
import type { FrameInput } from './frame';
import type { ImageAsset, ImageSource, Part, SpriteAxis } from './part';
import type { Bone, Rig, RigTemplateId } from './rig';
import { RIG_TEMPLATES } from './templates/rigs';
import { normalizeAngle } from './math';
import { INVALID_JSON } from './messages';

const SPRITE_AXES: readonly SpriteAxis[] = ['down', 'up', 'right', 'left'];

export interface ProjectSettings {
  pixelArt: boolean;
  background: string;
  spriteAxis: SpriteAxis;
  /** Camera rotation in degrees (clockwise), normalized to (-180, 180]; applied to view and export. */
  cameraRotation: number;
  /** Mirror at the vertical axis (before the roll); applied to view and export. */
  mirror: boolean;
  /** Tilt, turn and depth of all bones are ignored (the keys stay); applied to view and export. */
  depthLocked: boolean;
}

export interface Project {
  version: 1;
  name: string;
  rigTemplateId: RigTemplateId | null;
  rig: Rig;
  images: Record<string, ImageAsset>;
  parts: Part[];
  animations: Animation[];
  settings: ProjectSettings;
  /**
   * Per source project id (Klexel): the frame ids that were already created as an image once. A sync creates
   * images only for frames not listed here, so a linked sprite the user removed does not come back; an explicit
   * "Aus Klexel…" rebuilds missing ones and resets the list. Absent in projects without links (and old files).
   */
  linkedFrames?: Record<string, number[]>;
}

/** Normalizes a camera angle to (-180, 180] and rounds away float drift (1e-6 degrees). */
export function normalizeCameraAngle(deg: number): number {
  return Math.round(normalizeAngle(deg) * 1e6) / 1e6;
}

export function createProject(rigTemplateId: RigTemplateId, name = DEFAULT_PROJECT_NAME): Project {
  const template = RIG_TEMPLATES.find((t) => t.id === rigTemplateId);
  if (!template) throw new Error(`Unbekannte Rig-Vorlage: ${rigTemplateId}`);
  return {
    version: 1,
    name,
    rigTemplateId,
    rig: { bones: template.rig.bones.map((b) => ({ ...b })) },
    images: {},
    parts: [],
    animations: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** True if any animation has a key in a depth channel (tilt, turn, depth). */
export function usesDepthChannels(p: Project): boolean {
  return p.animations.some((a) =>
    Object.values(a.tracks).some((t) => DEPTH_CHANNELS.some((c) => (t[c]?.length ?? 0) > 0)),
  );
}

/**
 * The file text. Projects with depth keys are written as version 2, so an older app refuses them with the
 * "unsupported version" message instead of silently dropping the keys; all others stay version 1.
 */
export function serializeProject(p: Project): string {
  return JSON.stringify(usesDepthChannels(p) ? { ...p, version: 2 } : p);
}

type Obj = Record<string, unknown>;

class ParseError extends Error {}

const fail = (msg: string): never => {
  throw new ParseError(msg);
};

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** The fields `keys` of `o` if all of them pass `guard`, else null. */
function pick<K extends string, T>(o: Obj, keys: readonly K[], guard: (v: unknown) => v is T): Record<K, T> | null {
  const out = {} as Record<K, T>;
  for (const k of keys) {
    const v = o[k];
    if (!guard(v)) return null;
    out[k] = v;
  }
  return out;
}

const BAD_BONE = 'Rig ist ungültig: fehlerhafter Knochen.';
const BAD_IMAGES = 'Bilder sind ungültig.';
const BAD_PARTS = 'Teile sind ungültig.';
const BAD_ANIMATIONS = 'Animationen sind ungültig.';

function parseBone(b: unknown): Bone {
  if (!isObj(b)) return fail(BAD_BONE);
  const s = pick(b, ['id', 'name'], isStr);
  const n = pick(b, ['x', 'y', 'rotation', 'length', 'softness'], isNum);
  const parentId = b.parentId;
  if (!s || !n || !(parentId === null || isStr(parentId))) return fail(BAD_BONE);
  // length > 0 rather than MIN_BONE_LENGTH: files with shorter bones stay loadable.
  if (n.length <= 0 || n.softness < MIN_SOFTNESS) return fail(BAD_BONE);
  return { id: s.id, name: s.name, parentId, ...n };
}

function checkHierarchy(bones: Bone[]): void {
  const ids = new Set(bones.map((b) => b.id));
  if (ids.size !== bones.length) fail('Rig ist ungültig: doppelte Knochen-IDs.');
  if (bones.filter((b) => b.parentId === null).length !== 1) {
    fail('Rig ist ungültig: genau ein Wurzelknochen erforderlich.');
  }
  const byId = new Map(bones.map((b) => [b.id, b]));
  for (const b of bones) {
    if (b.parentId !== null && !ids.has(b.parentId)) fail('Rig ist ungültig: Elternknochen existiert nicht.');
    const seen = new Set<string>();
    for (let cur: Bone | undefined = b; cur; cur = cur.parentId === null ? undefined : byId.get(cur.parentId)) {
      if (seen.has(cur.id)) fail('Rig ist ungültig: zyklische Eltern-Beziehung.');
      seen.add(cur.id);
    }
  }
}

function parseBones(raw: unknown): Bone[] {
  if (!isObj(raw) || !Array.isArray(raw.bones)) return fail('Rig ist ungültig: Knochenliste fehlt.');
  const bones = raw.bones.map(parseBone);
  checkHierarchy(bones);
  return bones;
}

/** A structurally valid link, else undefined (an invalid link never fails the image). */
function parseSource(v: unknown): ImageSource | undefined {
  if (!isObj(v)) return undefined;
  const { projectId, frameId, name, missing } = v;
  if (!isStr(projectId) || projectId === '') return undefined;
  if (typeof frameId !== 'number' || !Number.isInteger(frameId) || frameId <= 0) return undefined;
  if (name !== undefined && !isStr(name)) return undefined;
  if (missing !== undefined && missing !== true) return undefined;
  const out: ImageSource = { projectId, frameId };
  if (name !== undefined) out.name = name;
  if (missing) out.missing = true;
  return out;
}

/** Valid entries of linkedFrames (non-empty id → distinct positive integers); invalid parts are dropped silently. */
function parseLinkedFrames(raw: unknown): Record<string, number[]> | undefined {
  if (!isObj(raw)) return undefined;
  const out: Record<string, number[]> = {};
  for (const [id, v] of Object.entries(raw)) {
    if (id === '' || id === '__proto__' || !Array.isArray(v)) continue;
    const ids = [...new Set(v.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0))];
    if (ids.length) out[id] = ids;
  }
  return Object.keys(out).length ? out : undefined;
}

function parseImage(key: string, v: unknown): ImageAsset {
  if (!isObj(v)) return fail(BAD_IMAGES);
  const s = pick(v, ['id', 'name', 'dataUrl'], isStr);
  const n = pick(v, ['width', 'height'], isNum);
  if (!s || !n || n.width <= 0 || n.height <= 0 || s.id !== key || key === '__proto__') return fail(BAD_IMAGES);
  // Only embedded image data: a remote URL would make the browser fetch it and taint the export canvas.
  if (!s.dataUrl.startsWith('data:image/')) {
    return fail('Bilder sind ungültig: nur eingebettete Bilddaten (data:image/…) erlaubt.');
  }
  const source = parseSource(v.source);
  return source ? { ...s, ...n, source } : { ...s, ...n };
}

function parseImages(raw: unknown): Record<string, ImageAsset> {
  if (!isObj(raw)) return fail(BAD_IMAGES);
  const out: Record<string, ImageAsset> = {};
  for (const [key, v] of Object.entries(raw)) out[key] = parseImage(key, v);
  return out;
}

function parsePart(v: unknown): Part {
  if (!isObj(v)) return fail(BAD_PARTS);
  const s = pick(v, ['id', 'imageId', 'boneId'], isStr);
  const n = pick(v, ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'z'], isNum);
  if (!s || !n || !isBool(v.visible)) return fail(BAD_PARTS);
  return { ...s, ...n, visible: v.visible };
}

/** Parts whose bone or image does not exist are dropped (after validation). */
function parseParts(raw: unknown, boneIds: Set<string>, images: Record<string, ImageAsset>): Part[] {
  if (!Array.isArray(raw)) return fail(BAD_PARTS);
  return raw.map(parsePart).filter((p) => boneIds.has(p.boneId) && images[p.imageId]);
}

/** Sorts by frame; for duplicate frames the last one wins. */
function normalizeKeys(keys: Keyframe[]): Keyframe[] {
  const byFrame = new Map<number, Keyframe>();
  for (const k of keys) byFrame.set(k.frame, k);
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}

function parseKey(k: unknown): Keyframe {
  if (!isObj(k) || !isNum(k.frame) || !isNum(k.value) || !EASINGS.includes(k.easing as Easing)) {
    return fail(BAD_ANIMATIONS);
  }
  return { frame: k.frame, value: k.value, easing: k.easing as Easing };
}

function parseTrack(rawTrack: unknown): BoneTrack {
  if (!isObj(rawTrack)) return fail(BAD_ANIMATIONS);
  const track: BoneTrack = {};
  for (const c of CHANNELS) {
    const keys = rawTrack[c];
    if (keys === undefined) continue;
    if (!Array.isArray(keys)) return fail(BAD_ANIMATIONS);
    track[c] = normalizeKeys(keys.map(parseKey));
  }
  return track;
}

/** Tracks of unknown bones are dropped; their content is not validated. */
function parseAnimation(a: unknown, boneIds: Set<string>): Animation {
  if (!isObj(a)) return fail(BAD_ANIMATIONS);
  const s = pick(a, ['id', 'name'], isStr);
  const n = pick(a, ['fps', 'length'], isNum);
  // > 0 rather than MIN_FPS / MIN_ANIMATION_LENGTH: such files stay loadable.
  if (!s || !n || n.fps <= 0 || n.length <= 0 || !isBool(a.loop) || !isObj(a.tracks)) return fail(BAD_ANIMATIONS);
  const tracks: Record<string, BoneTrack> = {};
  for (const [boneId, rawTrack] of Object.entries(a.tracks)) {
    if (!isObj(rawTrack)) return fail(BAD_ANIMATIONS);
    if (boneIds.has(boneId)) tracks[boneId] = parseTrack(rawTrack);
  }
  return { id: s.id, name: s.name, fps: n.fps, length: n.length, loop: a.loop, tracks };
}

function parseAnimations(raw: unknown, boneIds: Set<string>): Animation[] {
  if (!Array.isArray(raw)) return fail(BAD_ANIMATIONS);
  return raw.map((a: unknown) => parseAnimation(a, boneIds));
}

/** Validates the settings object; missing fields (or a missing object) fall back to DEFAULT_SETTINGS. */
function parseSettings(raw: unknown): ProjectSettings {
  const s = isObj(raw) ? raw : {};
  if (s.spriteAxis !== undefined && !SPRITE_AXES.includes(s.spriteAxis as SpriteAxis)) {
    fail('Ungültige Sprite-Richtung in den Einstellungen.');
  }
  if (s.cameraRotation !== undefined && !isNum(s.cameraRotation)) {
    fail('Ungültige Kameradrehung in den Einstellungen.');
  }
  if (s.mirror !== undefined && !isBool(s.mirror)) {
    fail('Ungültige Spiegelung in den Einstellungen.');
  }
  if (s.depthLocked !== undefined && !isBool(s.depthLocked)) {
    fail('Ungültige Sperre der Tiefe in den Einstellungen.');
  }
  // Old files stored a horizontal camera rotation (`cameraYaw`) instead: beyond ±90° it was mirrored.
  const legacyMirror = isNum(s.cameraYaw) ? Math.abs(normalizeCameraAngle(s.cameraYaw)) > 90 : DEFAULT_SETTINGS.mirror;
  return {
    pixelArt: isBool(s.pixelArt) ? s.pixelArt : DEFAULT_SETTINGS.pixelArt,
    background: isStr(s.background) ? s.background : DEFAULT_SETTINGS.background,
    spriteAxis: (s.spriteAxis as SpriteAxis | undefined) ?? DEFAULT_SETTINGS.spriteAxis,
    cameraRotation: normalizeCameraAngle(isNum(s.cameraRotation) ? s.cameraRotation : DEFAULT_SETTINGS.cameraRotation),
    mirror: isBool(s.mirror) ? s.mirror : legacyMirror,
    depthLocked: isBool(s.depthLocked) ? s.depthLocked : DEFAULT_SETTINGS.depthLocked,
  };
}

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string };

export function parseProject(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: INVALID_JSON };
  }
  return parseProjectData(data);
}

/** Validates an already parsed value (e.g. a project stored as an object) like parseProject, without JSON.parse. */
export function parseProjectData(data: unknown): ParseResult {
  try {
    if (!isObj(data)) return { ok: false, error: 'Die Datei ist kein gültiges Projekt.' };
    if (data.version !== 1 && data.version !== 2) return { ok: false, error: 'Das Projekt hat eine nicht unterstützte Version.' };
    if (!isObj(data.rig)) return { ok: false, error: 'Rig fehlt im Projekt.' };

    const bones = parseBones(data.rig);
    const boneIds = new Set(bones.map((b) => b.id));
    const images = parseImages(data.images ?? {});
    const parts = parseParts(data.parts ?? [], boneIds, images);
    const animations = parseAnimations(data.animations ?? [], boneIds);
    const settings = parseSettings(data.settings);
    const templateId = data.rigTemplateId;
    const project: Project = {
      version: 1,
      name: isStr(data.name) ? data.name : DEFAULT_PROJECT_NAME,
      rigTemplateId: RIG_TEMPLATES.some((t) => t.id === templateId) ? (templateId as RigTemplateId) : null,
      rig: { bones },
      images,
      parts,
      animations,
      settings,
    };
    const linkedFrames = parseLinkedFrames(data.linkedFrames);
    if (linkedFrames) project.linkedFrames = linkedFrames;
    return { ok: true, project };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    throw e;
  }
}

const normalizeName = (s: string) => s.toLowerCase().replace(/[_\-\s]/g, '');

/** True if discarding the project would lose user work (images, parts or animations). */
export function projectHasContent(p: Project): boolean {
  return Object.keys(p.images).length > 0 || p.parts.length > 0 || p.animations.length > 0;
}

export function matchBoneByFilename(fileName: string, bones: Bone[]): Bone | null {
  const base = normalizeName(fileName.replace(/\.[^./\\]*$/, ''));
  return bones.find((b) => normalizeName(b.name) === base) ?? null;
}

export function animationById(p: Project, id: string | null | undefined): Animation | undefined {
  return id == null ? undefined : p.animations.find((a) => a.id === id);
}

export function toFrameInput(p: Project, animationId: string | null): FrameInput {
  const images: FrameInput['images'] = {};
  for (const [id, img] of Object.entries(p.images)) images[id] = { width: img.width, height: img.height };
  return {
    rig: p.rig,
    parts: p.parts,
    images,
    animation: animationById(p, animationId) ?? null,
  };
}
