import { newId } from './id';
import type { ImageAsset } from './part';
import type { Project } from './project';
import { addImagesAutoAttach } from './projectOps';

export interface SourceFrame {
  frameId: number;
  name: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface SourceResult {
  projectName: string;
  frames: SourceFrame[];
}

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
 * Parts, animations, settings and rig stay untouched; `project === p` if nothing changed.
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
      const { missing: _gone, ...rest } = link;
      next = { ...next, source: rest };
    }
    if (f.name && next.name === (link.name ?? next.name) && (next.name !== f.name || link.name !== f.name)) {
      next = { ...next, name: f.name, source: { ...next.source!, name: f.name } };
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
