export type Hand = 'R' | 'L';

export interface PrecisionSettings {
  on: boolean;
  hand: Hand;
  pixelPerfect: boolean;
}

export const DEFAULT_SETTINGS: PrecisionSettings = { on: false, hand: 'R', pixelPerfect: true };
export const SETTINGS_KEY = 'pixelart.precision';

/** Liest Einstellungen aus dem gespeicherten Text; fehlende oder ungültige Felder behalten den Standardwert. */
export function parseSettings(raw: string | null): PrecisionSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return out; }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  const o = v as Record<string, unknown>;
  if (typeof o.on === 'boolean') out.on = o.on;
  if (o.hand === 'R' || o.hand === 'L') out.hand = o.hand;
  if (typeof o.pixelPerfect === 'boolean') out.pixelPerfect = o.pixelPerfect;
  return out;
}

export function loadSettings(): PrecisionSettings {
  try { return parseSettings(localStorage.getItem(SETTINGS_KEY)); } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: PrecisionSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* Speicher gesperrt */ }
}
