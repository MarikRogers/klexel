import { newId } from '../id';
import type { Animation, BoneTrack, Channel, Easing, Keyframe } from '../animation';
import { TAU } from '../math';
import { rigHeight, type Rig, type RigTemplateId } from '../rig';
import { RIG_TEMPLATES } from './rigs';

export interface AnimationTemplate {
  id: string;
  name: string;
  rigTemplateId: RigTemplateId;
  fps: number;
  length: number;
  loop: boolean;
  /** bone name -> channel keyframes (values are offsets from the rest pose) */
  tracks: Record<string, Partial<Record<Channel, Keyframe[]>>>;
}

type Tracks = AnimationTemplate['tracks'];

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Samples `fn(phase)` (phase 0..1) `steps` times per cycle plus the closing key at `length`. */
function cycle(length: number, steps: number, fn: (phase: number) => number): Keyframe[] {
  const keys: Keyframe[] = [];
  for (let i = 0; i < steps; i++) {
    keys.push({ frame: (i * length) / steps, value: round(fn(i / steps)), easing: 'linear' });
  }
  keys.push({ frame: length, value: keys[0].value, easing: 'linear' });
  return keys;
}

/** Explicit keys from [frame, value] pairs. */
function keys(pairs: [number, number][], easing: Easing = 'easeInOut'): Keyframe[] {
  return pairs.map(([frame, value]) => ({ frame, value, easing }));
}

/** Positive half-wave peaking at phase 0.75 (knee bend during the forward swing). */
const swingBend = (max: number) => (p: number) =>
  max * Math.max(0, Math.sin(TAU * ((((p % 1) + 1) % 1) - 0.5)));

function locomotion(
  length: number,
  steps: number,
  o: { thigh: number; shin: number; arm: number; bob: number; torso?: number; elbow?: number },
): Tracks {
  const c = (fn: (p: number) => number) => cycle(length, steps, fn);
  const tracks: Tracks = {
    hip: { y: c((p) => o.bob * Math.cos(2 * TAU * p)) },
    thigh_L: { rotation: c((p) => -o.thigh * Math.cos(TAU * p)) },
    thigh_R: { rotation: c((p) => o.thigh * Math.cos(TAU * p)) },
    shin_L: { rotation: c(swingBend(o.shin)) },
    shin_R: { rotation: c((p) => swingBend(o.shin)(p + 0.5)) },
    upperArm_L: { rotation: c((p) => o.arm * Math.cos(TAU * p)) },
    upperArm_R: { rotation: c((p) => -o.arm * Math.cos(TAU * p)) },
  };
  const torso = o.torso;
  if (torso !== undefined) tracks.torso = { rotation: c(() => torso) };
  const elbow = o.elbow;
  if (elbow !== undefined) {
    tracks.lowerArm_L = { rotation: c(() => -elbow) };
    tracks.lowerArm_R = { rotation: c(() => -elbow) };
  }
  return tracks;
}

const humanoidIdle: AnimationTemplate = {
  id: 'humanoid-idle',
  name: 'idle',
  rigTemplateId: 'humanoid',
  fps: 12,
  length: 24,
  loop: true,
  tracks: {
    hip: { y: cycle(24, 4, (p) => -Math.sin(TAU * p)) },
    torso: { rotation: cycle(24, 4, (p) => 2 * Math.sin(TAU * p)) },
    head: { rotation: cycle(24, 4, (p) => -1 * Math.sin(TAU * p)) },
  },
};

const humanoidWalk: AnimationTemplate = {
  id: 'humanoid-walk',
  name: 'walk',
  rigTemplateId: 'humanoid',
  fps: 12,
  length: 16,
  loop: true,
  tracks: locomotion(16, 8, { thigh: 25, shin: 40, arm: 20, bob: 1 }),
};

const humanoidRun: AnimationTemplate = {
  id: 'humanoid-run',
  name: 'run',
  rigTemplateId: 'humanoid',
  fps: 12,
  length: 12,
  loop: true,
  tracks: locomotion(12, 6, { thigh: 40, shin: 80, arm: 45, bob: 1.5, torso: 10, elbow: 60 }),
};

// Frames: 0 stand, 3 crouch, 6 take-off, 9 tuck (apex), 12 landing, 15 settle.
const humanoidJump: AnimationTemplate = {
  id: 'humanoid-jump',
  name: 'jump',
  rigTemplateId: 'humanoid',
  fps: 12,
  length: 16,
  loop: false,
  tracks: {
    hip: { y: keys([[0, 0], [3, 10], [6, -4], [9, -22], [12, 5], [15, 0]]) },
    torso: { rotation: keys([[0, 0], [3, 15], [6, -5], [9, 5], [12, 12], [15, 0]]) },
    thigh_L: { rotation: keys([[0, 0], [3, -40], [6, 5], [9, -30], [12, -25], [15, 0]]) },
    thigh_R: { rotation: keys([[0, 0], [3, -40], [6, 5], [9, -30], [12, -25], [15, 0]]) },
    shin_L: { rotation: keys([[0, 0], [3, 70], [6, 0], [9, 50], [12, 45], [15, 0]]) },
    shin_R: { rotation: keys([[0, 0], [3, 70], [6, 0], [9, 50], [12, 45], [15, 0]]) },
    upperArm_L: { rotation: keys([[0, 0], [3, 30], [6, -140], [9, -60], [12, 20], [15, 0]]) },
    upperArm_R: { rotation: keys([[0, 0], [3, 30], [6, -140], [9, -60], [12, 20], [15, 0]]) },
  },
};

// Frames: 0 rest, 2 wind-up/guard, 4 strike (right arm forward), 6 hold, 9 back to rest.
const humanoidPunch: AnimationTemplate = {
  id: 'humanoid-punch',
  name: 'punch',
  rigTemplateId: 'humanoid',
  fps: 12,
  length: 10,
  loop: false,
  tracks: {
    hip: { x: keys([[0, 0], [2, -2], [4, 3], [6, 3], [9, 0]]) },
    torso: { rotation: keys([[0, 0], [2, -6], [4, 12], [6, 12], [9, 0]]) },
    upperArm_R: { rotation: keys([[0, 0], [2, 20], [4, -90], [6, -90], [9, 0]]) },
    lowerArm_R: { rotation: keys([[0, 0], [2, -90], [4, -5], [6, -5], [9, 0]]) },
    upperArm_L: { rotation: keys([[0, 0], [2, -30], [4, -30], [6, -30], [9, 0]]) },
    lowerArm_L: { rotation: keys([[0, 0], [2, -100], [4, -100], [6, -100], [9, 0]]) },
  },
};

const quadrupedIdle: AnimationTemplate = {
  id: 'quadruped-idle',
  name: 'idle',
  rigTemplateId: 'quadruped',
  fps: 12,
  length: 24,
  loop: true,
  tracks: {
    body: { y: cycle(24, 4, (p) => -Math.sin(TAU * p)) },
    neck: { rotation: cycle(24, 4, (p) => 3 * Math.sin(TAU * p)) },
    tail1: { rotation: cycle(24, 4, (p) => 8 * Math.sin(TAU * p)) },
    tail2: { rotation: cycle(24, 4, (p) => 10 * Math.sin(TAU * p - 1)) },
  },
};

function quadrupedWalkTracks(): Tracks {
  const c = (fn: (p: number) => number) => cycle(16, 8, fn);
  const upper = (sign: number) => c((p) => -sign * 20 * Math.cos(TAU * p));
  const lower = (shift: number) => c((p) => swingBend(35)(p + shift));
  // Diagonal pairs move together: frontL + backR, frontR + backL.
  return {
    body: { y: c((p) => Math.cos(2 * TAU * p)) },
    neck: { rotation: c((p) => 3 * Math.cos(2 * TAU * p)) },
    tail1: { rotation: c((p) => 8 * Math.sin(TAU * p)) },
    tail2: { rotation: c((p) => 10 * Math.sin(TAU * p - 1)) },
    frontUpper_L: { rotation: upper(1) },
    backUpper_R: { rotation: upper(1) },
    frontUpper_R: { rotation: upper(-1) },
    backUpper_L: { rotation: upper(-1) },
    frontLower_L: { rotation: lower(0) },
    backLower_R: { rotation: lower(0) },
    frontLower_R: { rotation: lower(0.5) },
    backLower_L: { rotation: lower(0.5) },
  };
}

const quadrupedWalk: AnimationTemplate = {
  id: 'quadruped-walk',
  name: 'walk',
  rigTemplateId: 'quadruped',
  fps: 12,
  length: 16,
  loop: true,
  tracks: quadrupedWalkTracks(),
};

export const ANIMATION_TEMPLATES: AnimationTemplate[] = [
  humanoidIdle,
  humanoidWalk,
  humanoidRun,
  humanoidJump,
  humanoidPunch,
  quadrupedIdle,
  quadrupedWalk,
];

/**
 * Maps the template's bone names onto the rig's bone ids, drops tracks of bones the rig lacks and scales
 * translation by the ratio of the rig's height to the template rig's height (1 if either height is 0).
 */
export function applyAnimationTemplate(t: AnimationTemplate, rig: Rig): Animation {
  const templateRig = RIG_TEMPLATES.find((r) => r.id === t.rigTemplateId)?.rig;
  const templateHeight = templateRig ? rigHeight(templateRig) : 0;
  const height = rigHeight(rig);
  const ratio = templateHeight > 0 && height > 0 ? height / templateHeight : 1;
  const idByName = new Map(rig.bones.map((b) => [b.name, b.id]));
  const tracks: Record<string, BoneTrack> = {};
  for (const [name, track] of Object.entries(t.tracks)) {
    const id = idByName.get(name);
    if (id === undefined) continue;
    const out: BoneTrack = {};
    for (const [channel, ks] of Object.entries(track) as [Channel, Keyframe[]][]) {
      const factor = channel === 'x' || channel === 'y' ? ratio : 1;
      out[channel] = ks.map((k) => ({ ...k, value: k.value * factor }));
    }
    tracks[id] = out;
  }
  return { id: newId(), name: t.name, fps: t.fps, length: t.length, loop: t.loop, tracks };
}
