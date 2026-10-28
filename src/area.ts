import type { ProjectKind } from './workspace/types';

/** Startwerte für ein neues Projekt (Größe, optional ein Bild, z. B. aus einem Link). */
export interface NewProjectInit {
  width: number;
  height: number;
  image?: { width: number; height: number; pixels: Uint32Array };
}

/** Was die Hülle einem eingehängten Bereich bereitstellt. */
export interface AreaHost {
  /** Projekt wurde verändert, Autosave anstoßen */
  onChange(): void;
  /** Ein neues Projekt anlegen (statt das aktuelle zu ersetzen) */
  requestNewProject(init?: NewProjectInit): void;
  /** Ist der Bereich gerade sichtbar und bedienbar? */
  isActive(): boolean;
}

/** Steuerung eines eingehängten Bereichs durch die Hülle. */
export interface AreaHandle<P> {
  open(payload: P): void;
  snapshot(): P;
  thumbnail(): string | undefined;
  /** Offene Bearbeitung abschließen und sofort onChange melden */
  flush(): void;
  setActive(on: boolean): void;
  destroy(): void;
}

export interface Area<P> {
  kind: ProjectKind;
  title: string;
  mount(root: HTMLElement, host: AreaHost): AreaHandle<P>;
}
