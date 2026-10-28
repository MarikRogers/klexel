import { newId } from './id';
import { MAX_FPS, MIN_ANIMATION_LENGTH, MIN_FPS } from './defaults';
import { clamp } from './math';
import type { BoneOffset, Pose } from './rig';

export type Channel = 'rotation' | 'x' | 'y' | 'scaleX' | 'scaleY' | 'tilt' | 'turn' | 'depth';
export const CHANNELS: Channel[] = ['rotation', 'x', 'y', 'scaleX', 'scaleY', 'tilt', 'turn', 'depth'];

/** The channels that move a bone in depth (spec: Bewegung in der Tiefe). */
export const DEPTH_CHANNELS: readonly Channel[] = ['tilt', 'turn', 'depth'];

export const EASINGS = ['linear', 'step', 'easeInOut'] as const;
export type Easing = (typeof EASINGS)[number];

/** `easing` applies to the segment starting at this key. */
export interface Keyframe {
  frame: number;
  value: number;
  easing: Easing;
}

export type BoneTrack = Partial<Record<Channel, Keyframe[]>>;

/** Keys per channel are sorted by `frame`. Frames 0..length-1 are played; a key at `frame === length` is allowed (loop end). */
export interface Animation {
  id: string;
  name: string;
  fps: number;
  length: number;
  loop: boolean;
  tracks: Record<string, BoneTrack>;
}

export function channelDefault(c: Channel): number {
  return c === 'scaleX' || c === 'scaleY' ? 1 : 0;
}

function ease(easing: Easing, t: number): number {
  if (easing === 'step') return 0;
  if (easing === 'easeInOut') return t * t * (3 - 2 * t);
  return t;
}

export function sampleChannel(keys: Keyframe[], frame: number, defaultValue: number): number {
  if (keys.length === 0) return defaultValue;
  const first = keys[0];
  if (frame <= first.frame) return first.value;
  const last = keys[keys.length - 1];
  if (frame >= last.frame) return last.value;
  let i = 0;
  while (keys[i + 1].frame <= frame) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = (frame - a.frame) / (b.frame - a.frame);
  return a.value + (b.value - a.value) * ease(a.easing, t);
}

export function sampleAnimation(anim: Animation, frame: number): Pose {
  const pose: Pose = {};
  for (const [boneId, track] of Object.entries(anim.tracks)) {
    const offset: Partial<BoneOffset> = {};
    let any = false;
    for (const c of CHANNELS) {
      const keys = track[c];
      if (keys && keys.length > 0) {
        offset[c] = sampleChannel(keys, frame, channelDefault(c));
        any = true;
      }
    }
    if (any) pose[boneId] = offset;
  }
  return pose;
}

/** Replaces the track of a bone; drops empty channels and empty tracks. */
function withTrack(anim: Animation, boneId: string, track: BoneTrack): Animation {
  const cleaned: BoneTrack = {};
  for (const c of CHANNELS) {
    const keys = track[c];
    if (keys && keys.length > 0) cleaned[c] = keys;
  }
  const tracks = { ...anim.tracks };
  if (Object.keys(cleaned).length === 0) delete tracks[boneId];
  else tracks[boneId] = cleaned;
  return { ...anim, tracks };
}

function insertKey(keys: Keyframe[], key: Keyframe): Keyframe[] {
  return [...keys.filter((k) => k.frame !== key.frame), key].sort((a, b) => a.frame - b.frame);
}

export function setKey(anim: Animation, boneId: string, channel: Channel, key: Keyframe): Animation {
  const track = anim.tracks[boneId] ?? {};
  return withTrack(anim, boneId, { ...track, [channel]: insertKey(track[channel] ?? [], key) });
}

export function removeBoneKeysAt(anim: Animation, boneId: string, frame: number): Animation {
  const track = anim.tracks[boneId];
  if (!track) return anim;
  const next: BoneTrack = {};
  for (const c of CHANNELS) {
    const keys = track[c];
    if (keys) next[c] = keys.filter((k) => k.frame !== frame);
  }
  return withTrack(anim, boneId, next);
}

export function moveBoneKeys(anim: Animation, boneId: string, fromFrame: number, toFrame: number): Animation {
  const track = anim.tracks[boneId];
  if (!track || fromFrame === toFrame) return anim;
  const next: BoneTrack = {};
  for (const c of CHANNELS) {
    const keys = track[c];
    if (!keys) continue;
    const moving = keys.find((k) => k.frame === fromFrame);
    next[c] = moving
      ? insertKey(keys.filter((k) => k.frame !== fromFrame), { ...moving, frame: toFrame })
      : keys;
  }
  return withTrack(anim, boneId, next);
}

/** Sets the easing of every key at `frame` in the bone's track; returns `anim` itself if nothing changes. */
export function setKeyEasing(anim: Animation, boneId: string, frame: number, easing: Easing): Animation {
  const track = anim.tracks[boneId];
  if (!track) return anim;
  const next: BoneTrack = { ...track };
  let changed = false;
  for (const c of CHANNELS) {
    const keys = track[c];
    if (!keys?.some((k) => k.frame === frame && k.easing !== easing)) continue;
    next[c] = keys.map((k) => (k.frame === frame ? { ...k, easing } : k));
    changed = true;
  }
  return changed ? { ...anim, tracks: { ...anim.tracks, [boneId]: next } } : anim;
}

export function keyedFrames(anim: Animation, boneId: string): number[] {
  const track = anim.tracks[boneId];
  if (!track) return [];
  const frames = new Set<number>();
  for (const c of CHANNELS) for (const k of track[c] ?? []) frames.add(k.frame);
  return [...frames].sort((a, b) => a - b);
}

export function createAnimation(name: string, fps = 12, length = 24, loop = true): Animation {
  return { id: newId(), name, fps, length, loop, tracks: {} };
}

export type AnimationPatch = Partial<Pick<Animation, 'name' | 'fps' | 'length' | 'loop'>>;

/** Clamps `fps` to [MIN_FPS, MAX_FPS] and `length` to >= MIN_ANIMATION_LENGTH; other fields pass through. */
export function sanitizeAnimationPatch(patch: AnimationPatch): AnimationPatch {
  const out = { ...patch };
  if (out.fps !== undefined) out.fps = clamp(out.fps, MIN_FPS, MAX_FPS);
  if (out.length !== undefined) out.length = Math.max(MIN_ANIMATION_LENGTH, out.length);
  return out;
}
