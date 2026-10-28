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

export const RIG_TEMPLATES: RigTemplate[] = [
  { id: 'humanoid', name: 'Humanoid', rig: { bones: build(humanoid) } },
  { id: 'quadruped', name: 'Vierbeiner', rig: { bones: build(quadruped) } },
];
