// Zustand des Dialogs „Nach Klexel" (rein): Eingaben → Planung → Warnung/Vorschlag.
import { planReturn, RETURN_MAX_FRAMES, RETURN_MAX_SIZE, type ReturnOptions, type ReturnPlan } from '../core/returnPlan';

export interface FrameSize {
  width: number;
  height: number;
  frameCount: number;
  fps: number;
}

/** Startwerte: Originalgröße, alle Frames. */
export function initialOptions(size: FrameSize | null): ReturnOptions {
  return { scale: 1, from: 0, to: Math.max(0, (size?.frameCount ?? 1) - 1) };
}

/** Planung der aktuellen Eingaben; null ohne Animation. */
export function planFor(size: FrameSize | null, opts: ReturnOptions): ReturnPlan | null {
  return size ? planReturn(size.width, size.height, size.frameCount, opts) : null;
}

export const LIMIT_TEXT = `Zu groß für Klexel: höchstens ${RETURN_MAX_SIZE}×${RETURN_MAX_SIZE} Pixel und ${RETURN_MAX_FRAMES} Frames`;

/** Höchste Bildrate von Klexel (klexelFromFrames begrenzt darauf). */
export const KLEXEL_MAX_FPS = 30;

/** Hinweis, wenn die Animation schneller ist, als Klexel abspielen kann; sonst null. */
export function fpsHint(fps: number): string | null {
  return fps > KLEXEL_MAX_FPS
    ? `Klexel unterstützt höchstens ${KLEXEL_MAX_FPS} fps – die Animation wird mit ${KLEXEL_MAX_FPS} fps angelegt.`
    : null;
}

/** Deutsche Warnung zu einer nicht passenden Planung (mit den konkreten Werten). */
export function warningText(size: FrameSize, opts: ReturnOptions, plan: Extract<ReturnPlan, { ok: false }>): string {
  const parts: string[] = [];
  if (plan.reasons.includes('invalid')) {
    return `Ungültige Angaben: Maßstab ganze Zahl ab 1, Frames von 1 bis ${size.frameCount} (von ≤ bis).`;
  }
  if (plan.reasons.includes('too-wide')) {
    parts.push(`Bild ${Math.ceil(size.width / opts.scale)}×${Math.ceil(size.height / opts.scale)} Pixel`);
  }
  if (plan.reasons.includes('too-many-frames')) parts.push(`${opts.to - opts.from + 1} Frames`);
  return `${LIMIT_TEXT} (gewählt: ${parts.join(', ')}).`;
}

/** Beschreibung eines Vorschlags für die Schaltfläche/den Hinweis (1-basiert). */
export function suggestionText(s: ReturnOptions): string {
  return `Maßstab 1/${s.scale}, Frames ${s.from + 1}–${s.to + 1}`;
}

/** 1-basierte Eingabe im Feld → 0-basierter Wert (leere oder ungültige Eingabe bleibt ungültig: NaN). */
export function fromUiIndex(value: string): number {
  const n = Number(value);
  return value.trim() === '' || !Number.isInteger(n) ? Number.NaN : n - 1;
}
