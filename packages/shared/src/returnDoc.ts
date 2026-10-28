// Austausch Rigsprite → Klexel (DOM-frei): eine gerenderte Animation als neues Dokument eines Bereichs.

/** Ein Bild der Rückgabe (Pixel 0xRRGGBBAA, Breite × Höhe des Dokuments). */
export interface FramesDocFrame {
  name: string;
  pixels: Uint32Array;
}

/** Inhalt eines neuen Dokuments aus Einzelbildern (AreaDescriptor.fromFrames). */
export interface FramesDocInput {
  name: string;
  width: number;
  height: number;
  fps: number;
  frames: FramesDocFrame[];
}

/** Rückgabe einer Animation an die Hülle (AreaHost.returnToKlexel). */
export interface ReturnRequest extends FramesDocInput {
  origin: { animationId: string };
}

/** Ergebnis: das neu angelegte Projekt (nicht geöffnet). */
export interface ReturnResult {
  projectId: string;
  name: string;
}
