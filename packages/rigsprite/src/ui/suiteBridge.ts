import { createContext, useContext } from 'react';
import type { Project } from '../core/project';

/**
 * Connection to the suite (Klexel-Suite) when Rigsprite runs as one of its areas; absent in the standalone app.
 * With it, "Neu" and "Öffnen" create new workspace projects instead of replacing the open one.
 */
export interface SuiteBridge {
  /** Shows the suite's project list. */
  openProjects(): void;
  /** Creates (and opens) a new workspace project with this content; the current project stays. */
  newProject(project: Project): void;
  /** Logo address (the suite has no Rigsprite files in its public folder). */
  logoUrl?: string;
}

export const SuiteContext = createContext<SuiteBridge | null>(null);

/** The suite connection, or null in the standalone app. */
export const useSuite = (): SuiteBridge | null => useContext(SuiteContext);
