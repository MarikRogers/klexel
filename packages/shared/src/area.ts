import type { ProjectKind } from './workspace/types';
import type { SourceService } from './sources';
import type { ReturnRequest, ReturnResult } from './returnDoc';

/** Größte Bildbreite/-höhe neuer Projekte (Klexel: MAX_SIZE). */
export const MAX_IMAGE_SIZE = 128;

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
  /**
   * Ein neues Projekt dieses Bereichs anlegen (statt das aktuelle zu ersetzen). content = fertiger Inhalt
   * (z. B. aus einer Datei); fehlt er oder ist er nicht lesbar, entsteht ein leeres Projekt aus init.
   */
  requestNewProject(init?: NewProjectInit, content?: unknown): void;
  /** Projektliste der Hülle zeigen (für Bereiche ohne eigenen Knopf der Hülle in ihrer Kopfleiste) */
  openProjects?(): void;
  /** Ist der Bereich gerade sichtbar und bedienbar? */
  isActive(): boolean;
  /** Bild-Quellen anderer Projekte (Klexel-Frames); fehlt, wenn kein Bereich dieses Builds Frames liefern kann. */
  sources?: SourceService;
  /**
   * Animation als NEUES Klexel-Projekt anlegen (Rigsprite → Klexel); das offene Projekt bleibt offen und unverändert,
   * jeder Aufruf legt ein weiteres Projekt an. Herkunft = das offene Projekt + animationId. Lehnt mit deutscher
   * Meldung ab. Fehlt, wenn kein Bereich dieses Builds aus Frames anlegen kann (AreaDescriptor.fromFrames).
   */
  returnToKlexel?(req: ReturnRequest): Promise<ReturnResult>;
  /** Öffnet ein Projekt per ID (eingereiht wie ein Wechsel in der Projektliste). */
  openProject?(id: string): Promise<void>;
}

/** Steuerung eines eingehängten Bereichs durch die Hülle. */
export interface AreaHandle<P> {
  open(payload: P): void;
  /** Aktueller Stand zum Speichern. Vorher flush() aufrufen, sonst fehlt eine schwebende Auswahl. */
  snapshot(): P;
  thumbnail(): string | undefined;
  /** Offene Bearbeitung abschließen und sofort onChange melden */
  flush(): void;
  setActive(on: boolean): void;
  destroy(): void;
  /**
   * Den Link im #-Teil der Adresse jetzt behandeln (AreaDescriptor.handlesHash): Die Hülle hat deswegen zu diesem
   * schon eingehängten Bereich gewechselt, während er verdeckt war und den hashchange nicht beachtet hat. Aufruf
   * erst nach dem Wechsel (Bereich aktiv). Mehrfache Aufrufe dürfen keinen zweiten Dialog öffnen.
   */
  followLink?(): void;
}

export interface Area<P> {
  kind: ProjectKind;
  title: string;
  mount(root: HTMLElement, host: AreaHost): AreaHandle<P>;
}
