// Frames einer einzelnen Animation für die Rückgabe an Klexel (rein, ohne GL/DOM): dieselbe Kamera-Abbildung und
// dieselben Grenzen wie der Spritesheet-Export (Frontansicht, Spiegelung, Rollen), Maßstab 1 und ohne Padding.
import { computeExportBounds, planSheet } from './export';
import { buildFrame, type FrameData } from './frame';
import { animationById, toFrameInput, type Project } from './project';

export interface AnimationFrames {
  name: string;
  fps: number;
  /** Alle Frames der Animation (0..length-1) */
  frames: FrameData[];
  /** Einheitliche Frame-Größe in Pixeln */
  width: number;
  height: number;
  /** Lage des Rig-Ursprungs im Frame (wie der Pivot des Spritesheets) */
  pivot: { x: number; y: number };
}

/** Rand um die Figur bei der Rückgabe (der Export nimmt das eingestellte Padding; hier eng). */
export const RETURN_PADDING = 0;

/** Frames und gemeinsame Grenzen einer Animation; null = Animation unbekannt. */
export function animationFrames(project: Project, animationId: string): AnimationFrames | null {
  const anim = animationById(project, animationId);
  if (!anim) return null;
  const input = toFrameInput(project, anim.id);
  const count = Math.max(1, anim.length);
  const frames = Array.from({ length: count }, (_, i) => buildFrame(input, i));
  const { cameraRotation, mirror } = project.settings;
  const bounds = computeExportBounds(frames, RETURN_PADDING, cameraRotation, mirror ? -1 : 1);
  const { frameW, frameH, pivot } = planSheet([count], bounds, 1, 1);
  return { name: anim.name, fps: anim.fps, frames, width: frameW, height: frameH, pivot };
}

/** Frame-Größe, Frame-Anzahl und fps einer Animation (für die Planung vor dem Rendern); null = unbekannt. */
export function animationFrameSize(
  project: Project,
  animationId: string,
): { width: number; height: number; frameCount: number; fps: number } | null {
  const a = animationFrames(project, animationId);
  return a && { width: a.width, height: a.height, frameCount: a.frames.length, fps: a.fps };
}

/**
 * RGBA-Bytes (je Pixel R, G, B, A; z. B. aus getImageData oder readPixels) → 0xRRGGBBAA je Pixel, Zeilen von oben.
 * flipY = Zeilen kommen von unten (readPixels von WebGL); getImageData liefert sie bereits von oben.
 */
export function rgbaToPacked(bytes: ArrayLike<number>, width: number, height: number, flipY = false): Uint32Array {
  if (bytes.length !== width * height * 4) throw new RangeError('Pixelanzahl passt nicht zu Breite × Höhe');
  const out = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) {
    const src = (flipY ? height - 1 - y : y) * width * 4;
    const dst = y * width;
    for (let x = 0; x < width; x++) {
      const i = src + x * 4;
      out[dst + x] = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
    }
  }
  return out;
}
