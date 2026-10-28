import { newId } from '../id';
import type { Animation, BoneTrack, Channel, Easing, Keyframe } from '../animation';
import { TAU } from '../math';
import { rigHeight, type Rig, type RigTemplateId } from '../rig';
import { outward, RIG_TEMPLATES, type ViewSide } from './rigs';

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

/*
 * Front and back views.
 *
 * Limbs cannot swing forward/backward in the picture plane, so the frontal sets use: vertical bob (y of the
 * root), lateral weight shift (x of the root, small torso lean), leg lift as foreshortening (scaleX of the
 * thigh/upper leg; children inherit it) plus a small inward turn, arm swing as foreshortening plus a small
 * sideways turn, and for the punch a uniform scale-up of the punching arm (it comes toward the viewer).
 *
 * Bone names are character-relative (`_L` = the character's left), but on screen the character's left is at
 * +x in the front view and at -x in the back view. Every screen-space quantity (root x, torso lean, outward
 * limb rotation) is therefore multiplied by `side` (+1 front, -1 back); everything else is shared.
 */

type Side = 'L' | 'R';
type View = { prefix: RigTemplateId; side: ViewSide };

/** Positive half-wave: the lift of the left leg (phase 0..0.5) or, half a cycle later, the right leg. */
const liftOf = (s: Side) => (p: number) => Math.max(0, Math.sin(TAU * p + (s === 'L' ? 0 : Math.PI)));

/** Screen x (or clockwise lean of an up-pointing bone) toward the character's side `s` by `v`. */
const toward = (side: ViewSide, s: Side, v: number) => (s === 'L' ? side : -side) * v;

function frontalLocomotion(
  side: ViewSide,
  length: number,
  steps: number,
  o: { lift: number; turn: number; arm: number; armTurn: number; bob: number; shift: number; lean: number; elbow?: number },
): Tracks {
  const c = (fn: (p: number) => number) => cycle(length, steps, fn);
  const tracks: Tracks = {
    hip: {
      // lowest at double support (phase 0 and 0.5), highest while a leg passes
      y: c((p) => o.bob * Math.cos(2 * TAU * p)),
      // weight over the stance leg: while the left leg is lifted the hip moves toward the right leg
      x: c((p) => toward(side, 'R', o.shift * Math.sin(TAU * p))),
    },
    torso: { rotation: c((p) => toward(side, 'R', o.lean * Math.sin(TAU * p))) },
    head: { rotation: c((p) => -toward(side, 'R', 0.5 * o.lean * Math.sin(TAU * p))) },
  };
  for (const s of ['L', 'R'] as const) {
    const lift = liftOf(s);
    // the opposite arm swings forward while this leg lifts; the own arm swings back (foreshortened less)
    const forward = liftOf(s === 'L' ? 'R' : 'L');
    tracks[`thigh_${s}`] = {
      scaleX: c((p) => 1 - o.lift * lift(p)),
      rotation: c((p) => -outward(side, s, o.turn * lift(p))),
    };
    tracks[`upperArm_${s}`] = {
      scaleX: c((p) => 1 - o.arm * forward(p) - 0.5 * o.arm * lift(p)),
      rotation: c((p) => -outward(side, s, o.armTurn * forward(p))),
    };
    const elbow = o.elbow;
    if (elbow !== undefined) tracks[`lowerArm_${s}`] = { scaleX: c(() => elbow) };
  }
  return tracks;
}

/** One track per side, for bones named `${stem}_L` / `${stem}_R`. */
function bothSides(stem: string, fn: (s: Side) => Partial<Record<Channel, Keyframe[]>>): Tracks {
  return { [`${stem}_L`]: fn('L'), [`${stem}_R`]: fn('R') };
}

function humanoidViewSet({ prefix, side }: View): AnimationTemplate[] {
  const base = { rigTemplateId: prefix, fps: 12 };
  const out = (s: Side, deg: number) => outward(side, s, deg);
  const tw = (s: Side, v: number) => toward(side, s, v);
  const [windUp, strike] = side === 1 ? [0.92, 1.2] : [1.05, 0.85];
  const punchScale: [number, number][] = [[0, 1], [2, windUp], [4, strike], [6, strike], [9, 1]];
  return [
    {
      ...base,
      id: `${prefix}-idle`,
      name: 'idle',
      length: 24,
      loop: true,
      tracks: {
        hip: {
          y: cycle(24, 4, (p) => -Math.sin(TAU * p)),
          x: cycle(24, 4, (p) => tw('L', 0.5 * Math.sin(TAU * p))),
        },
        torso: { rotation: cycle(24, 4, (p) => tw('L', 1.5 * Math.sin(TAU * p))) },
        head: { rotation: cycle(24, 4, (p) => -tw('L', Math.sin(TAU * p))) },
        // breathing: the arms move slightly outward
        ...bothSides('upperArm', (s) => ({
          rotation: cycle(24, 4, (p) => out(s, 1.5 * Math.max(0, Math.sin(TAU * p)))),
        })),
      },
    },
    {
      ...base,
      id: `${prefix}-walk`,
      name: 'walk',
      length: 16,
      loop: true,
      tracks: frontalLocomotion(side, 16, 8, { lift: 0.12, turn: 2, arm: 0.06, armTurn: 3, bob: 1, shift: 1.5, lean: 1.5 }),
    },
    {
      ...base,
      id: `${prefix}-run`,
      name: 'run',
      length: 12,
      loop: true,
      tracks: frontalLocomotion(side, 12, 6, {
        lift: 0.22,
        turn: 4,
        arm: 0.12,
        armTurn: 8,
        bob: 2.5,
        shift: 2.5,
        lean: 3,
        elbow: 0.8,
      }),
    },
    // Frames: 0 stand, 3 crouch, 6 take-off (arms up and out), 9 apex, 12 landing, 15 settle.
    {
      ...base,
      id: `${prefix}-jump`,
      name: 'jump',
      length: 16,
      loop: false,
      tracks: {
        hip: { y: keys([[0, 0], [3, 10], [6, -4], [9, -22], [12, 8], [15, 0]]) },
        torso: { scaleX: keys([[0, 1], [3, 0.95], [6, 1], [9, 1], [12, 0.96], [15, 1]]) },
        // knees come toward the viewer (foreshortened legs) and spread a little
        ...bothSides('thigh', (s) => ({
          scaleX: keys([[0, 1], [3, 0.8], [6, 1], [9, 0.85], [12, 0.84], [15, 1]]),
          rotation: keys([[0, 0], [3, out(s, 6)], [6, 0], [9, out(s, 4)], [12, out(s, 5)], [15, 0]]),
        })),
        ...bothSides('upperArm', (s) => ({
          rotation: keys([[0, 0], [3, out(s, 10)], [6, out(s, 110)], [9, out(s, 60)], [12, out(s, 25)], [15, 0]]),
        })),
        ...bothSides('lowerArm', (s) => ({
          rotation: keys([[0, 0], [3, 0], [6, out(s, 15)], [9, out(s, 10)], [12, 0], [15, 0]]),
        })),
      },
    },
    // Frames: 0 rest, 2 wind-up/guard, 4 strike (right arm forward), 6 hold, 9 back to rest.
    {
      ...base,
      id: `${prefix}-punch`,
      name: 'punch',
      length: 10,
      loop: false,
      tracks: {
        hip: { x: keys([[0, 0], [2, tw('L', 1)], [4, tw('R', 2)], [6, tw('R', 2)], [9, 0]]) },
        torso: { rotation: keys([[0, 0], [2, tw('R', 3)], [4, tw('L', 5)], [6, tw('L', 5)], [9, 0]]) },
        head: { rotation: keys([[0, 0], [2, 0], [4, tw('R', 3)], [6, tw('R', 3)], [9, 0]]) },
        // Uniform scale = perspective (and keeps the bent forearm free of shear). The punch goes forward:
        // toward the viewer in the front view (bigger), away from the viewer in the back view (smaller).
        upperArm_R: {
          rotation: keys([[0, 0], [2, out('R', 10)], [4, 0], [6, 0], [9, 0]]),
          scaleX: keys(punchScale),
          scaleY: keys(punchScale),
        },
        lowerArm_R: { rotation: keys([[0, 0], [2, out('R', -140)], [4, out('R', -120)], [6, out('R', -120)], [9, 0]]) },
        // guard: fist up in front of the chin
        upperArm_L: { rotation: keys([[0, 0], [2, out('L', 10)], [4, out('L', 10)], [6, out('L', 10)], [9, 0]]) },
        lowerArm_L: { rotation: keys([[0, 0], [2, out('L', -140)], [4, out('L', -140)], [6, out('L', -140)], [9, 0]]) },
      },
    },
  ];
}

function quadrupedViewSet({ prefix, side }: View): AnimationTemplate[] {
  const base = { rigTemplateId: prefix, fps: 12 };
  const c = (fn: (p: number) => number) => cycle(16, 8, fn);
  const tw = (s: Side, v: number) => toward(side, s, v);
  // Diagonal pairs lift together: frontL + backR (phase 0..0.5), frontR + backL (phase 0.5..1).
  // `phase` names the front leg of the pair; `s` is the side of the bone itself (for the outward turn).
  const leg = (phase: Side, s: Side) => ({
    scaleX: c((p) => 1 - 0.15 * liftOf(phase)(p)),
    rotation: c((p) => -outward(side, s, 2 * liftOf(phase)(p))),
  });
  return [
    {
      ...base,
      id: `${prefix}-idle`,
      name: 'idle',
      length: 24,
      loop: true,
      tracks: {
        body: { y: cycle(24, 4, (p) => -Math.sin(TAU * p)) },
        neck: { rotation: cycle(24, 4, (p) => tw('L', 2 * Math.sin(TAU * p))) },
        head: { rotation: cycle(24, 4, (p) => -tw('L', 3 * Math.sin(TAU * p))) },
        tail1: { rotation: cycle(24, 4, (p) => 8 * Math.sin(TAU * p)) },
        tail2: { rotation: cycle(24, 4, (p) => 10 * Math.sin(TAU * p - 1)) },
      },
    },
    {
      ...base,
      id: `${prefix}-walk`,
      name: 'walk',
      length: 16,
      loop: true,
      tracks: {
        body: {
          y: c((p) => Math.cos(2 * TAU * p)),
          // weight moves toward the right front leg while the left front leg is lifted
          x: c((p) => tw('R', Math.sin(TAU * p))),
        },
        neck: { rotation: c((p) => tw('R', 2 * Math.sin(TAU * p))) },
        head: { rotation: c((p) => -tw('R', 2 * Math.sin(TAU * p))) },
        tail1: { rotation: c((p) => 8 * Math.sin(TAU * p)) },
        tail2: { rotation: c((p) => 10 * Math.sin(TAU * p - 1)) },
        frontUpper_L: leg('L', 'L'),
        backUpper_R: leg('L', 'R'),
        frontUpper_R: leg('R', 'R'),
        backUpper_L: leg('R', 'L'),
      },
    },
  ];
}

export const ANIMATION_TEMPLATES: AnimationTemplate[] = [
  humanoidIdle,
  humanoidWalk,
  humanoidRun,
  humanoidJump,
  humanoidPunch,
  quadrupedIdle,
  quadrupedWalk,
  ...humanoidViewSet({ prefix: 'humanoid-front', side: 1 }),
  ...humanoidViewSet({ prefix: 'humanoid-back', side: -1 }),
  ...quadrupedViewSet({ prefix: 'quadruped-front', side: 1 }),
  ...quadrupedViewSet({ prefix: 'quadruped-back', side: -1 }),
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
