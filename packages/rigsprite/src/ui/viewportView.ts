import { clamp, type Vec2 } from '../core/math';
import { MAX_ZOOM, MIN_ZOOM, screenToWorld, worldToScreen, type ViewTransform } from '../render/view';
import type { EditorState } from '../state/store';
import { WHEEL_ZOOM_SENSITIVITY } from './constants';

/** Viewport size in CSS pixels plus the device pixel ratio. */
export interface ViewportSize {
  width: number;
  height: number;
  dpr: number;
}

/** The view in CSS pixels: pan / zoom and orbit from the editor, roll and mirror from the project camera. */
export function cssView(s: Pick<EditorState, 'view' | 'project' | 'orbit'>, size: ViewportSize): ViewTransform {
  const { cameraRotation: rotation, mirror } = s.project.settings;
  const { yaw, pitch } = s.orbit;
  return { ...s.view, rotation, yaw, pitch, mirror, width: size.width, height: size.height };
}

/** The same view in device pixels of a canvas of `width` × `height`. */
export function deviceView(view: ViewTransform, dpr: number, width: number, height: number): ViewTransform {
  return { ...view, x: view.x * dpr, y: view.y * dpr, zoom: view.zoom * dpr, width, height };
}

/** Wheel zoom at screen point `p`: the world point under `p` stays fixed; zoom clamped to [MIN_ZOOM, MAX_ZOOM]. */
export function zoomAt(view: ViewTransform, p: Vec2, deltaY: number): { x: number; y: number; zoom: number } {
  const w = screenToWorld(view, p);
  const zoom = clamp(view.zoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY), MIN_ZOOM, MAX_ZOOM);
  // Where would the world point land with zero pan at the new zoom?
  const unpanned = worldToScreen({ ...view, x: 0, y: 0, zoom }, w);
  return { x: p.x - unpanned.x, y: p.y - unpanned.y, zoom };
}
