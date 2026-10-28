import type { Animation } from '../core/animation';
import { buildFrame, type FrameData } from '../core/frame';
import { animationById, toFrameInput, type Project } from '../core/project';
import type { EditorState } from '../state/store';

export type FrameState = Pick<EditorState, 'project' | 'mode' | 'animationId' | 'frame'>;

interface FrameKey {
  rig: Project['rig'];
  parts: Project['parts'];
  images: Project['images'];
  animation: Animation | null;
  frame: number;
  depthLocked: boolean;
}

/**
 * The frame the viewport shows: setup mode shows the rest pose, animate mode samples the active
 * animation (missing → none). Remembers the last result and rebuilds only when one of its inputs
 * (rig, parts, images, sampled animation object, frame) changes by reference, so pure view /
 * selection changes just redraw.
 */
export function createFrameCache(): (s: FrameState) => FrameData {
  let key: FrameKey | null = null;
  let data: FrameData | null = null;
  return (s) => {
    const animationId = s.mode === 'animate' ? s.animationId : null;
    const next: FrameKey = {
      rig: s.project.rig,
      parts: s.project.parts,
      images: s.project.images,
      animation: animationById(s.project, animationId) ?? null,
      frame: s.frame,
      depthLocked: s.project.settings.depthLocked,
    };
    if (
      data &&
      key &&
      key.rig === next.rig &&
      key.parts === next.parts &&
      key.images === next.images &&
      key.animation === next.animation &&
      key.frame === next.frame &&
      key.depthLocked === next.depthLocked
    ) {
      return data;
    }
    key = next;
    data = buildFrame(toFrameInput(s.project, animationId), s.frame);
    return data;
  };
}
