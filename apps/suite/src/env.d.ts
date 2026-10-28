/// <reference types="vite/client" />
import type { ProjectKind } from '@suite/shared';

declare global {
  /** Beim Bauen gewählte Bereiche (vite.config.ts: aus VITE_AREAS) */
  const __AREAS__: ProjectKind[];
  /** Ist Klexel enthalten? Fester Wert beim Bauen, damit abgeschaltete Zweige samt Import entfallen. */
  const __AREA_KLEXEL__: boolean;
  /** Ist Rigsprite enthalten? */
  const __AREA_RIGSPRITE__: boolean;

  interface ImportMetaEnv {
    readonly VITE_AREAS?: string;
  }
}
