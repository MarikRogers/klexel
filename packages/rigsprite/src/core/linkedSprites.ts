import type { SourceFrame, SourceResult } from '@suite/shared';
import { newId } from './id';
import type { ImageAsset } from './part';
import type { Project } from './project';
import { addImagesAutoAttach } from './projectOps';
import { boneById } from './rig';

// The exchange types live in the shared contract (the suite shell produces them); re-exported for Rigsprite code.
export type { SourceFrame, SourceResult };

const DEFAULT_NAME = /^Frame \d+$/;

/** Frame ids of `projectId` that currently have an image. */
function framesWithImage(p: Project, projectId: string): Set<number> {
  const ids = new Set<number>();
  for (const img of Object.values(p.images)) {
    if (img.source?.projectId === projectId) ids.add(img.source.frameId);
  }
  return ids;
}

/** `p` with linkedFrames[projectId] = `ids` (sorted); the same object if that is already the list. */
function withLinkedFrames(p: Project, projectId: string, ids: Iterable<number>): Project {
  const next = [...new Set(ids)].sort((a, b) => a - b);
  const cur = p.linkedFrames?.[projectId];
  if (cur && cur.length === next.length && cur.every((n, i) => n === next[i])) return p;
  if (!cur && next.length === 0) return p;
  return { ...p, linkedFrames: { ...p.linkedFrames, [projectId]: next } };
}

/**
 * New linked images for the frames of `source` that no image of `projectId` links yet. Unless `rebuild`, frames
 * listed in linkedFrames (created once, removed by the user since) are skipped too: only really new frames.
 */
function newImages(p: Project, projectId: string, source: SourceResult, rebuild: boolean): ImageAsset[] {
  const known = framesWithImage(p, projectId);
  if (!rebuild) for (const id of p.linkedFrames?.[projectId] ?? []) known.add(id);
  const out: ImageAsset[] = [];
  source.frames.forEach((f, i) => {
    if (known.has(f.frameId)) return;
    known.add(f.frameId);
    out.push({
      id: newId(),
      name: f.name || `Frame ${i + 1}`,
      dataUrl: f.dataUrl,
      width: f.width,
      height: f.height,
      source: { projectId, frameId: f.frameId, name: f.name || undefined },
    });
  });
  return out;
}

/** Adds `imgs` (auto-attached by name) and records their frames in linkedFrames (on top of `base` ids). */
function addLinked(p: Project, projectId: string, imgs: ImageAsset[], base: Iterable<number>): { project: Project; added: string[] } {
  let project = imgs.length ? addImagesAutoAttach(p, imgs) : p;
  project = withLinkedFrames(project, projectId, [...base, ...imgs.map((i) => i.source!.frameId)]);
  return { project, added: imgs.map((i) => i.id) };
}

/**
 * Explicit link ("Aus Klexel…"): one image per source frame without an image - also frames the user removed
 * before (deliberate rebuild); auto-attached by name (new images only). Resets linkedFrames to the frames that
 * have an image afterwards.
 */
export function linkFramesAsImages(
  p: Project,
  projectId: string,
  source: SourceResult,
): { project: Project; added: string[] } {
  return addLinked(p, projectId, newImages(p, projectId, source, true), framesWithImage(p, projectId));
}

/** Sync part of refreshLinkedImages: images only for really new frames; linkedFrames remembers them all. */
function addNewFrames(p: Project, projectId: string, source: SourceResult): { project: Project; added: string[] } {
  const base = [...(p.linkedFrames?.[projectId] ?? []), ...framesWithImage(p, projectId)];
  return addLinked(p, projectId, newImages(p, projectId, source, false), base);
}

/**
 * Syncs the images linked to `projectId` with `source` (null = project gone). Identity is the frame id.
 * `updated` counts only pixel/size changes (not renames). Parts, animations, settings and rig stay untouched; `project === p` if nothing changed.
 */
export function refreshLinkedImages(
  p: Project,
  projectId: string,
  source: SourceResult | null,
): { project: Project; added: string[]; updated: string[]; missing: string[] } {
  const frames = new Map<number, SourceFrame>();
  for (const f of source?.frames ?? []) if (!frames.has(f.frameId)) frames.set(f.frameId, f);

  const updated: string[] = [];
  const missing: string[] = [];
  const images: Record<string, ImageAsset> = {};
  let changed = false;

  for (const [id, img] of Object.entries(p.images)) {
    const link = img.source;
    if (!link || link.projectId !== projectId) {
      images[id] = img;
      continue;
    }
    const f = frames.get(link.frameId);
    if (!f) {
      if (link.missing) {
        images[id] = img;
      } else {
        images[id] = { ...img, source: { ...link, missing: true } };
        missing.push(id);
        changed = true;
      }
      continue;
    }
    let next = img;
    const pixels = img.dataUrl !== f.dataUrl || img.width !== f.width || img.height !== f.height;
    if (pixels) {
      next = { ...next, dataUrl: f.dataUrl, width: f.width, height: f.height };
      updated.push(id);
    }
    if (link.missing) {
      next = { ...next, source: { projectId: link.projectId, frameId: link.frameId, name: link.name } };
      if (link.name === undefined) delete next.source!.name;
    }
    // Name sync: the image follows the frame name only if the user did not rename it. "Not renamed" means the
    // image still carries the name last synced (source.name), or - if the frame had no name at link time -
    // the default name "Frame <n>". source.name is always pulled to the current frame name (so later syncs
    // can tell a user rename apart); a cleared frame name changes nothing.
    if (f.name) {
      const untouched = link.name !== undefined ? img.name === link.name : DEFAULT_NAME.test(img.name);
      const name = untouched ? f.name : next.name;
      if (name !== next.name || next.source?.name !== f.name) {
        next = { ...next, name, source: { ...next.source!, name: f.name } };
      }
    }
    if (next !== img) changed = true;
    images[id] = next;
  }

  let project: Project = changed ? { ...p, images } : p;
  let added: string[] = [];
  if (source) {
    const r = addNewFrames(project, projectId, source);
    project = r.project;
    added = r.added;
  }
  return { project, added, updated, missing };
}

/**
 * Carries a link update (`before` → `after`, as produced by refreshLinkedImages / linkFramesAsImages on the current
 * project) into another project state `q` - an undo/redo history entry or the start of an open transaction - so that
 * stepping through the history never brings back stale pixels or drops sprites the update added.
 *  - Linked images changed by the update get its pixels, size and link state in `q` (if `q` has them); the name only
 *    if `q` still carries the name the update replaced (a user rename in `q` stays).
 *  - Images new in the update are added to `q` only if `q` already links that source project (no orphans in states
 *    from before the link); parts new in the update (auto-attach) too, if their image and bone exist in `q`.
 *  - linkedFrames of the source projects `q` links become the union of `q`'s and the update's list.
 *  - Everything else in `q` stays. Returns `q` itself if nothing applies.
 */
export function carryLinkedUpdate(q: Project, before: Project, after: Project): Project {
  const linksOf = (pid: string) => Object.values(q.images).some((i) => i.source?.projectId === pid);
  let images: Record<string, ImageAsset> | null = null;
  for (const [id, img] of Object.entries(after.images)) {
    const old = before.images[id];
    if (old === img) continue;
    const cur = q.images[id];
    let next: ImageAsset;
    if (cur === undefined) {
      if (old !== undefined) continue; // the image was added after (or removed before) `q`: leave `q` alone
      if (!img.source || !linksOf(img.source.projectId)) continue;
      next = img;
    } else {
      if (!img.source) continue;
      next = { ...cur, dataUrl: img.dataUrl, width: img.width, height: img.height, source: img.source };
      if (old && img.name !== old.name && cur.name === old.name) next.name = img.name;
    }
    images ??= { ...q.images };
    images[id] = next;
  }
  const known = new Set(before.parts.map((p) => p.id));
  const have = new Set(q.parts.map((p) => p.id));
  const finalImages = images ?? q.images;
  const parts = after.parts.filter(
    (p) => !known.has(p.id) && !have.has(p.id) && finalImages[p.imageId] && boneById(q.rig, p.boneId),
  );
  let out: Project = !images && parts.length === 0 ? q : { ...q, images: finalImages, parts: parts.length ? [...q.parts, ...parts] : q.parts };
  if (after.linkedFrames !== before.linkedFrames) {
    for (const [pid, ids] of Object.entries(after.linkedFrames ?? {})) {
      if (ids === before.linkedFrames?.[pid] || !linksOf(pid)) continue;
      out = withLinkedFrames(out, pid, [...(out.linkedFrames?.[pid] ?? []), ...ids]);
    }
  }
  return out;
}

/**
 * `p` with every link to a Klexel project rewritten through `idMap` (old id → new id): `images[*].source.projectId`
 * and the keys of `linkedFrames`. Used when a workspace file is imported and all project ids change. Ids not in the
 * map stay as they are; the same object if nothing maps. Does not mutate `p`.
 */
export function remapSourceIds(p: Project, idMap: ReadonlyMap<string, string>): Project {
  const srcImages = p.images ?? {};
  let images = srcImages;
  for (const [key, img] of Object.entries(srcImages)) {
    const from = img?.source?.projectId;
    const to = typeof from === 'string' ? idMap.get(from) : undefined;
    if (to === undefined || to === from) continue;
    if (images === srcImages) images = { ...srcImages };
    images[key] = { ...img, source: { ...img.source!, projectId: to } };
  }
  let linkedFrames = p.linkedFrames;
  if (linkedFrames && Object.keys(linkedFrames).some((k) => { const to = idMap.get(k); return to !== undefined && to !== k; })) {
    // Map statt Objekt, damit Schlüssel wie "constructor" oder "__proto__" nichts Eigenes treffen
    const next = new Map<string, number[]>();
    for (const [k, ids] of Object.entries(linkedFrames)) {
      const to = idMap.get(k) ?? k;
      const cur = next.get(to);
      next.set(to, cur ? [...new Set([...cur, ...ids])].sort((a, b) => a - b) : [...ids]);
    }
    linkedFrames = {};
    for (const [k, v] of next) Object.defineProperty(linkedFrames, k, { value: v, enumerable: true, writable: true, configurable: true });
  }
  if (images === srcImages && linkedFrames === p.linkedFrames) return p;
  return { ...p, ...(p.images ? { images } : {}), ...(linkedFrames ? { linkedFrames } : {}) };
}
