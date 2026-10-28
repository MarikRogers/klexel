import { describe, expect, it } from 'vitest';
import { linkFramesAsImages, refreshLinkedImages, type SourceFrame, type SourceResult } from './linkedSprites';
import { createProject, type Project } from './project';

const frame = (frameId: number, name: string, over: Partial<SourceFrame> = {}): SourceFrame => ({
  frameId, name, width: 10, height: 20, dataUrl: `data:image/png;base64,F${frameId}`, ...over,
});
const src = (...frames: SourceFrame[]): SourceResult => ({ projectName: 'Held', frames });
const PID = 'proj-1';

function linked(frames: SourceFrame[] = [frame(1, 'head'), frame(2, 'random')]) {
  const { project, added } = linkFramesAsImages(createProject('humanoid'), PID, src(...frames));
  return { project, added };
}

describe('linkFramesAsImages', () => {
  it('adds one linked image per frame and auto-attaches by name', () => {
    const { project, added } = linked();
    expect(added).toHaveLength(2);
    const imgs = added.map((id) => project.images[id]);
    expect(imgs.map((i) => i.name)).toEqual(['head', 'random']);
    expect(imgs[0].source).toEqual({ projectId: PID, frameId: 1, name: 'head' });
    expect(project.parts.map((x) => [x.imageId, x.boneId])).toEqual([[added[0], 'head']]);
  });

  it('uses Frame <n> for empty names and leaves source.name undefined', () => {
    const { project, added } = linked([frame(7, ''), frame(9, 'x')]);
    expect(project.images[added[0]].name).toBe('Frame 1');
    expect(project.images[added[0]].source?.name).toBeUndefined();
    expect(project.images[added[1]].name).toBe('x');
  });

  it('adds nothing on a second call', () => {
    const { project } = linked();
    const again = linkFramesAsImages(project, PID, src(frame(1, 'head'), frame(2, 'random')));
    expect(again.added).toEqual([]);
    expect(again.project).toBe(project);
  });

  it('handles empty input', () => {
    const p = createProject('humanoid');
    const r = linkFramesAsImages(p, PID, src());
    expect(r.project).toBe(p);
    expect(r.added).toEqual([]);
  });
});

describe('refreshLinkedImages', () => {
  it('updates changed pixels while parts stays referentially identical', () => {
    const { project: p, added } = linked();
    const r = refreshLinkedImages(p, PID, src(frame(1, 'head', { dataUrl: 'data:image/png;base64,NEW', width: 12 }), frame(2, 'random')));
    expect(r.updated).toEqual([added[0]]);
    expect(r.project.images[added[0]]).toMatchObject({ dataUrl: 'data:image/png;base64,NEW', width: 12, height: 20 });
    expect(r.project.images[added[1]]).toBe(p.images[added[1]]);
    expect(r.project.parts).toBe(p.parts);
    expect(r.project.animations).toBe(p.animations);
    expect(r.project.settings).toBe(p.settings);
    expect(r.project.rig).toBe(p.rig);
  });

  it('renamed frame: no second image, assignments kept, image renamed if the user had not', () => {
    const { project: p, added } = linked();
    const r = refreshLinkedImages(p, PID, src(frame(1, 'kopf2'), frame(2, 'random')));
    expect(Object.keys(r.project.images)).toHaveLength(2);
    expect(r.added).toEqual([]);
    expect(r.project.images[added[0]].name).toBe('kopf2');
    expect(r.project.images[added[0]].source?.name).toBe('kopf2');
    expect(r.project.parts).toBe(p.parts);
  });

  it('keeps a name the user changed', () => {
    const { project: p, added } = linked();
    const mine = { ...p, images: { ...p.images, [added[0]]: { ...p.images[added[0]], name: 'mein Kopf' } } };
    const r = refreshLinkedImages(mine, PID, src(frame(1, 'kopf2'), frame(2, 'random')));
    expect(r.project.images[added[0]].name).toBe('mein Kopf');
  });

  it('marks a deleted frame as missing and keeps the image', () => {
    const { project: p, added } = linked();
    const r = refreshLinkedImages(p, PID, src(frame(2, 'random')));
    expect(r.missing).toEqual([added[0]]);
    expect(r.project.images[added[0]]).toMatchObject({ dataUrl: p.images[added[0]].dataUrl, name: 'head' });
    expect(r.project.images[added[0]].source?.missing).toBe(true);
    expect(r.project.parts).toBe(p.parts);
  });

  it('source null marks all linked images missing; unchanged project object if already missing', () => {
    const { project: p, added } = linked();
    const r = refreshLinkedImages(p, PID, null);
    expect(r.missing.sort()).toEqual([...added].sort());
    expect(r.project.parts).toBe(p.parts);
    expect(r.project.images[added[1]].source?.missing).toBe(true);
    const r2 = refreshLinkedImages(r.project, PID, null);
    expect(r2.project).toBe(r.project);
    expect(r2.missing).toEqual([]);
  });

  it('a later successful refresh clears missing', () => {
    const { project: p, added } = linked();
    const gone = refreshLinkedImages(p, PID, null).project;
    const back = refreshLinkedImages(gone, PID, src(frame(1, 'head'), frame(2, 'random')));
    expect(back.project.images[added[0]].source).toEqual({ projectId: PID, frameId: 1, name: 'head' });
    expect(back.project.images[added[0]].source?.missing).toBeUndefined();
  });

  it('new frame upperArm_L is auto-attached; manually moved part is not touched', () => {
    const { project: p0, added } = linked();
    const moved: Project = { ...p0, parts: p0.parts.map((x) => ({ ...x, boneId: 'torso', x: 5 })) };
    const r = refreshLinkedImages(moved, PID, src(frame(1, 'head'), frame(2, 'random'), frame(3, 'upperArm_L')));
    expect(r.added).toHaveLength(1);
    expect(r.project.images[r.added[0]].name).toBe('upperArm_L');
    expect(r.project.parts).toHaveLength(2);
    expect(r.project.parts[0]).toBe(moved.parts[0]);
    expect(r.project.parts[1]).toMatchObject({ imageId: r.added[0], boneId: 'upperArm_L' });
    expect(added).toHaveLength(2);
  });

  it('re-sorted frames change nothing', () => {
    const { project: p } = linked();
    const r = refreshLinkedImages(p, PID, src(frame(2, 'random'), frame(1, 'head')));
    expect(r.project).toBe(p);
    expect(r.added).toEqual([]);
    expect(r.updated).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('leaves unrelated images untouched', () => {
    const { project: p0 } = linked();
    const p: Project = {
      ...p0,
      images: {
        ...p0.images,
        plain: { id: 'plain', name: 'plain', dataUrl: 'data:image/png;base64,P', width: 1, height: 1 },
        other: { id: 'other', name: 'o', dataUrl: 'data:image/png;base64,O', width: 1, height: 1, source: { projectId: 'zzz', frameId: 1 } },
      },
    };
    const r = refreshLinkedImages(p, PID, null);
    expect(r.project.images.plain).toBe(p.images.plain);
    expect(r.project.images.other).toBe(p.images.other);
  });

  it('does not throw on empty input', () => {
    const p = createProject('humanoid');
    expect(refreshLinkedImages(p, PID, src()).project).toBe(p);
    expect(refreshLinkedImages(p, PID, null).project).toBe(p);
  });
});
