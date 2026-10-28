import type { SourceFrame, SourceResult } from '@suite/shared';
import { newId } from './id';
import type { ImageAsset } from './part';
import type { Project } from './project';
import { addImagesAutoAttach } from './projectOps';
import { boneById } from './rig';

// The exchange types live in the shared contract (the suite shell produces them); re-exported for Rigsprite code.
export type { SourceFrame, SourceResult };

const DEFAULT_NAME = /^Frame \d+$/;

/** New linked images for the frames of `source` that no image of `projectId` links yet. */
function newImages(p: Project, projectId: string, source: SourceResult): ImageAsset[] {
  const known = new Set<number>();
  for (const img of Object.values(p.images)) {
    if (img.source?.projectId === projectId) known.add(img.source.frameId);
  }
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

/** First-time link: one image per source frame not yet linked; auto-attached by name (new images only). */
export function linkFramesAsImages(
  p: Project,
  projectId: string,
  source: SourceResult,
): { project: Project; added: string[] } {
  const imgs = newImages(p, projectId, source);
  if (imgs.length === 0) return { project: p, added: [] };
  return { project: addImagesAutoAttach(p, imgs), added: imgs.map((i) => i.id) };
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
    const r = linkFramesAsImages(project, projectId, source);
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
 *  - Images new in the update are added to `q`; parts new in the update (auto-attach) too, if their bone exists in `q`.
 *  - Everything else in `q` stays. Returns `q` itself if nothing applies.
 */
export function carryLinkedUpdate(q: Project, before: Project, after: Project): Project {
  let images: Record<string, ImageAsset> | null = null;
  for (const [id, img] of Object.entries(after.images)) {
    const old = before.images[id];
    if (old === img) continue;
    const cur = q.images[id];
    let next: ImageAsset;
    if (cur === undefined) {
      if (old !== undefined) continue; // the image was added after (or removed before) `q`: leave `q` alone
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
  if (!images && parts.length === 0) return q;
  return { ...q, images: finalImages, parts: parts.length ? [...q.parts, ...parts] : q.parts };
}
