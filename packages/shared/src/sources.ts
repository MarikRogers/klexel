// Austausch Klexel → Rigsprite (DOM-frei): was ein Bereich als Bild-Quelle liefert und was die Hülle daraus macht.
import type { ProjectMeta } from './workspace/types';

/** Was ein Quell-Projekt als Bilder liefert: je Frame (sichtbare Ebenen zusammengerechnet) oder je Ebene. */
export type SourceMode = 'frames' | 'layers';

/**
 * Ein Bild eines Quell-Projekts (Originalgröße): im Modus „frames“ ein Frame mit zusammengerechneten sichtbaren
 * Ebenen, im Modus „layers“ eine einzelne Ebene (aus dem ersten Frame; frameId ist dann die Ebenen-ID).
 */
export interface SourceFrame {
  /** Feste Kennung des Frames im Quell-Projekt (Klexel: Frame-ID) */
  frameId: number;
  /** Frame-Name; leer = unbenannt */
  name: string;
  width: number;
  height: number;
  /** PNG-Data-URL */
  dataUrl: string;
}

/** Inhalt eines Quell-Projekts: sein Name (aus der Projektliste) und alle Frames in Reihenfolge. */
export interface SourceResult {
  projectName: string;
  /** Fehlt = 'frames' */
  mode?: SourceMode;
  frames: SourceFrame[];
}

/** Frame eines Projekts als Pixel (0xRRGGBBAA), bevor die Hülle ihn zu einem Bild macht. */
export interface PixelFrame {
  frameId: number;
  name: string;
  width: number;
  height: number;
  pixels: Uint32Array;
}

/**
 * Bild-Quellen der Hülle für einen Bereich (AreaHost.sources). Gibt es nur, wenn ein Bereich dieses Builds Frames
 * liefern kann (AreaDescriptor.framesOf; heute Klexel); sonst fehlt der Dienst und die Oberfläche blendet die
 * Verknüpfung aus.
 */
export interface SourceService {
  /** Projekte, deren Art Frames liefern kann, zuletzt geänderte zuerst. */
  list(): Promise<ProjectMeta[]>;
  /**
   * Frames (oder, mit mode 'layers', Ebenen) des Projekts als Bilder; ist es gerade offen, wird vorher gesichert (ungesicherte Änderungen zählen mit).
   * null = Projekt gelöscht, nicht lesbar oder keine Quelle.
   */
  read(projectId: string, mode?: SourceMode): Promise<SourceResult | null>;
}
