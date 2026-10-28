import type { ProjectSettings } from './project';

export const DEFAULT_PROJECT_NAME = 'Neues Projekt';

export const DEFAULT_SETTINGS: Readonly<ProjectSettings> = {
  pixelArt: false,
  background: '#2b2b2b',
  spriteAxis: 'down',
  cameraRotation: 0,
  mirror: false,
};

/** Default distance between the depth layers of the orbit view (px per z rank). */
export const DEFAULT_LAYER_SPACING = 12;
/** Range of the layer spacing. */
export const MIN_LAYER_SPACING = 0;
export const MAX_LAYER_SPACING = 100;

/** Largest tilt / turn of a bone in degrees: keeps the projected bone matrix invertible. */
export const MAX_DEPTH_ANGLE_DEG = 85;
/** Part depths are rounded to this many rig pixels before they decide the draw order. */
export const DEPTH_SORT_STEP = 1;

/** Length of a freshly added bone. */
export const DEFAULT_BONE_LENGTH = 20;

export const MIN_FPS = 1;
export const MAX_FPS = 120;

/** Lower bounds enforced when the editor changes a bone or an animation. */
export const MIN_BONE_LENGTH = 1;
export const MIN_SOFTNESS = 0;
export const MIN_ANIMATION_LENGTH = 1;
