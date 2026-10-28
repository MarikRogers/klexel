import type { ProjectKind } from './workspace/types';
import type { Area, NewProjectInit } from './area';

/**
 * Leichte, statisch ladbare Beschreibung eines Bereichs: alles, was die Hülle über die Projekte dieser Art
 * wissen muss, ohne den Editor selbst zu laden. Der Editor kommt erst mit load() (eigener Chunk).
 */
export interface AreaDescriptor<P> {
  kind: ProjectKind;
  title: string;
  /** Lädt den einhängbaren Bereich (dynamischer Import, samt seiner Styles). */
  load(): Promise<Area<P>>;
  /** Inhalt eines neuen, leeren Projekts; previous = aktueller Inhalt, damit z. B. Palette und Farbe erhalten bleiben. */
  blank(init?: NewProjectInit, previous?: P): P;
  /** Prüft einen gespeicherten oder importierten Inhalt; null = nicht lesbar. */
  decode(raw: unknown): P | null;
  /** Günstiger Schlüssel zur Erkennung von Änderungen: gleich bei gleichem Inhalt, sonst (praktisch immer) verschieden. */
  changeKey(p: P): string;
  /** Alter Einzel-Speicherstand (vor dem Workspace) für die einmalige Übernahme; null = keiner/unlesbar. */
  readLegacy?(): Promise<unknown | null>;
  /** Name des übernommenen Alt-Stands in der Projektliste */
  legacyName?: string;
  /** Fragt „Neues Projekt" in der Projektliste nach Breite und Höhe? (Klexel ja, Rigsprite nein) */
  newProjectSize?: boolean;
  /**
   * Wartezeit der Hülle zwischen einer Änderungsmeldung (onChange) und dem Sichern. Bereiche, die jede kleine
   * Änderung sofort melden (Rigsprite), drosseln so die vollen Speichervorgänge; flush/Wechsel/Schließen sichern sofort.
   * Ohne Angabe: DEFAULT_AUTOSAVE_DELAY_MS (für Bereiche, die selbst schon entprellt melden, wie Klexel).
   */
  autosaveDelayMs?: number;
}

/** Standard-Wartezeit des Autosaves der Hülle (Klexel meldet bereits entprellt, 500 ms). */
export const DEFAULT_AUTOSAVE_DELAY_MS = 50;
