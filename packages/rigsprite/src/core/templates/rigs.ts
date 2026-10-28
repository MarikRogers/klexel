import { defaultSoftness, type Bone, type RigTemplate } from '../rig';

type Spec = [name: string, parent: string | null, x: number, y: number, rotation: number, length: number];

function build(specs: Spec[]): Bone[] {
  return specs.map(([name, parentId, x, y, rotation, length]) => ({
    id: name,
    name,
    parentId,
    x,
    y,
    rotation,
    length,
    softness: defaultSoftness(length),
  }));
}

const humanoid: Spec[] = [
  ['hip', null, 0, 0, -90, 10],
  ['torso', 'hip', 10, 0, 0, 34],
  ['head', 'torso', 34, 0, 0, 24],
  ['upperArm_L', 'torso', 30, 0, 180, 22],
  ['lowerArm_L', 'upperArm_L', 22, 0, 0, 20],
  ['hand_L', 'lowerArm_L', 20, 0, 0, 8],
  ['upperArm_R', 'torso', 30, 0, 180, 22],
  ['lowerArm_R', 'upperArm_R', 22, 0, 0, 20],
  ['hand_R', 'lowerArm_R', 20, 0, 0, 8],
  ['thigh_L', 'hip', 0, 0, 180, 28],
  ['shin_L', 'thigh_L', 28, 0, 0, 26],
  ['foot_L', 'shin_L', 26, 0, -90, 12],
  ['thigh_R', 'hip', 0, 0, 180, 28],
  ['shin_R', 'thigh_R', 28, 0, 0, 26],
  ['foot_R', 'shin_R', 26, 0, -90, 12],
];

// Body horizontal facing +x, legs pointing down (rotation 90).
const quadruped: Spec[] = [
  ['body', null, 0, 0, 0, 60],
  ['neck', 'body', 60, 0, -45, 20],
  ['head', 'neck', 20, 0, 45, 20],
  ['tail1', 'body', 0, 0, 200, 20],
  ['tail2', 'tail1', 20, 0, 20, 20],
  ['frontUpper_L', 'body', 52, 0, 90, 24],
  ['frontLower_L', 'frontUpper_L', 24, 0, 0, 24],
  ['frontUpper_R', 'body', 52, 0, 90, 24],
  ['frontLower_R', 'frontUpper_R', 24, 0, 0, 24],
  ['backUpper_L', 'body', 8, 0, 90, 24],
  ['backLower_L', 'backUpper_L', 24, 0, 0, 24],
  ['backUpper_R', 'body', 8, 0, 90, 24],
  ['backLower_R', 'backUpper_R', 24, 0, 0, 24],
];

/*
 * Front and back views.
 *
 * Bone names are identical to the side templates, so sprites (and Klexel frames) named after bones attach in
 * every view. `_L` / `_R` always mean the CHARACTER's own left / right:
 * - front view (character faces the viewer): the character's left appears on the viewer's RIGHT (+x),
 * - back view (viewer looks at the character's back): the character's left appears on the viewer's LEFT (-x).
 * `side` is the screen x sign of the character's left side: +1 in the front view, -1 in the back view.
 *
 * The roots point up (rotation -90), so a child's local +y is world +x: sideways offsets go into the y field.
 * For a limb hanging down (local rotation 180 relative to an up-pointing parent) a rotation delta of
 * `-side * d` turns a left limb outward, `+side * d` a right limb.
 */
export type ViewSide = 1 | -1;

/** Rotation delta that turns a limb of character side `limb` outward by `deg` degrees, in a view with `side`. */
export function outward(side: ViewSide, limb: 'L' | 'R', deg: number): number {
  return (limb === 'L' ? -side : side) * deg;
}

function humanoidFrontal(side: ViewSide): Spec[] {
  const shoulder = 15; // half shoulder width
  const hipHalf = 7; // half hip width
  const limbs = (s: 'L' | 'R'): Spec[] => {
    const y = (v: number) => (s === 'L' ? side : -side) * v;
    return [
      [`upperArm_${s}`, 'torso', 30, y(shoulder), 180 + outward(side, s, 10), 22],
      [`lowerArm_${s}`, `upperArm_${s}`, 22, 0, 0, 20],
      [`hand_${s}`, `lowerArm_${s}`, 20, 0, 0, 8],
      [`thigh_${s}`, 'hip', 0, y(hipHalf), 180 + outward(side, s, 4), 28],
      [`shin_${s}`, `thigh_${s}`, 28, 0, 0, 26],
      // Seen from the front/back the foot points down and splays outward (30 degrees from vertical).
      [`foot_${s}`, `shin_${s}`, 26, 0, outward(side, s, 26), 12],
    ];
  };
  return [
    ['hip', null, 0, 0, -90, 10],
    ['torso', 'hip', 10, 0, 0, 34],
    ['head', 'torso', 34, 0, 0, 24],
    ...limbs('L'),
    ...limbs('R'),
  ];
}

/**
 * Quadruped seen head-on (`side` 1) or from behind (`side` -1): a short vertical stack body -> neck -> head
 * above the legs. The nearer leg pair (front legs in the front view, back legs in the back view) sits wider
 * apart and lower; the farther pair is narrower and a bit higher (perspective). Tail: in the front view it
 * peeks out behind the body at an angle, in the back view it is a short stub rising from the body centre.
 */
function quadrupedFrontal(side: ViewSide): Spec[] {
  const legs = (pair: 'front' | 'back', near: boolean): Spec[] =>
    (['L', 'R'] as const).flatMap((s): Spec[] => [
      [
        `${pair}Upper_${s}`,
        'body',
        near ? 0 : 3,
        (s === 'L' ? side : -side) * (near ? 10 : 6),
        180 + outward(side, s, 3),
        24,
      ],
      [`${pair}Lower_${s}`, `${pair}Upper_${s}`, 24, 0, 0, 24],
    ]);
  const tail: Spec[] =
    side === 1
      ? [
          ['tail1', 'body', 12, 0, 35, 12],
          ['tail2', 'tail1', 12, 0, 25, 10],
        ]
      : [
          ['tail1', 'body', 12, 0, 0, 10],
          ['tail2', 'tail1', 10, 0, 15, 10],
        ];
  return [
    ['body', null, 0, 0, -90, 16],
    ['neck', 'body', 16, 0, 0, 8],
    ['head', 'neck', 8, 0, 0, 16],
    ...tail,
    ...legs('front', side === 1),
    ...legs('back', side === -1),
  ];
}

export const RIG_TEMPLATES: RigTemplate[] = [
  { id: 'humanoid', name: 'Humanoid', rig: { bones: build(humanoid) } },
  { id: 'quadruped', name: 'Vierbeiner', rig: { bones: build(quadruped) } },
  { id: 'humanoid-front', name: 'Humanoid – Vorderansicht', rig: { bones: build(humanoidFrontal(1)) } },
  { id: 'humanoid-back', name: 'Humanoid – Rückansicht', rig: { bones: build(humanoidFrontal(-1)) } },
  { id: 'quadruped-front', name: 'Vierbeiner – Vorderansicht', rig: { bones: build(quadrupedFrontal(1)) } },
  { id: 'quadruped-back', name: 'Vierbeiner – Rückansicht', rig: { bones: build(quadrupedFrontal(-1)) } },
];
