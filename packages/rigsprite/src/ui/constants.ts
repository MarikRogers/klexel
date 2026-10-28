// UI tuning values shared by the viewport, timeline and toolbar.

/** Wheel zoom: zoom factor per wheel delta unit is `exp(-deltaY · sensitivity)`. */
export const WHEEL_ZOOM_SENSITIVITY = 0.0015;
/** A part / pose drag starts changing the project only after the pointer moved this far (screen px). */
export const DRAG_THRESHOLD_PX = 3;
/** Bone hit radius around the drawn bone, in screen px (mouse / pen). */
export const BONE_HIT_PX = 6;
/** Tilt handle: distance from the bone (screen px), mouse hit radius (px; a finger gets twice) and degrees per dragged px. */
export const TILT_HANDLE_OFFSET_PX = 28;
export const TILT_HANDLE_HIT_PX = 11;
export const TILT_DEG_PER_PX = 0.8;
/** Fingers are less precise than a mouse cursor: touch hit radius = BONE_HIT_PX · factor. */
export const TOUCH_HIT_FACTOR = 3;

/** Holding a timeline key this long (touch / pen) opens the easing menu. */
export const LONG_PRESS_MS = 500;
/** Moving further than this (px) cancels the long-press. */
export const LONG_PRESS_SLOP_PX = 8;

/** Timeline frame cell width on desktop (px). */
export const CELL_DESKTOP = 14;
/** Wider frame cells on phones, so 36 px tall key hit boxes (one cell wide) do not overlap. */
export const CELL_PHONE = 24;
/** Phone layout breakpoint (matches the `@media` rule in app.css). */
export const PHONE_QUERY = '(max-width: 767.98px)';
/** Width of the bone-name column in the timeline (px; `.tl-name` in app.css). */
export const NAME_COLUMN_WIDTH = 110;

/** Camera turn per Q / E key press and per toolbar button, in degrees. */
export const CAMERA_KEY_STEP_DEG = 15;
export const CAMERA_BUTTON_STEP_DEG = 90;
/** Right-button orbit drag: camera turn per screen px of pointer movement, in degrees. */
export const ORBIT_DEG_PER_PX = 0.5;
/** Orbit presets (yaw, pitch in degrees), like Blender's numpad 1 / 3 / 7. */
export const ORBIT_FRONT = { yaw: 0, pitch: 0 } as const;
export const ORBIT_SIDE = { yaw: 90, pitch: 0 } as const;
export const ORBIT_TOP = { yaw: 0, pitch: 90 } as const;
