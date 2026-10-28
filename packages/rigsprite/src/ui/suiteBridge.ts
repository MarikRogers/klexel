import { createContext, useContext } from 'react';
import type { ReturnRequest, ReturnResult, SourceService } from '@suite/shared';
import type { LinkedSyncSummary } from '../areaLogic';
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
  /** Klexel projects as image sources; absent when the build has no Klexel (the linking UI is hidden then). */
  sources?: SourceService;
  /** Refreshes all linked images from their sources now ("Aktualisieren"); present together with `sources`. */
  syncSources?(): Promise<LinkedSyncSummary>;
  /** Creates a NEW Klexel project from rendered frames ("Nach Klexel…"); absent without Klexel in the build. */
  returnToKlexel?(req: ReturnRequest): Promise<ReturnResult>;
  /** Opens a workspace project by id (switches away from Rigsprite). */
  openProject?(id: string): Promise<void>;
}

export const SuiteContext = createContext<SuiteBridge | null>(null);

/** The suite connection, or null in the standalone app. */
export const useSuite = (): SuiteBridge | null => useContext(SuiteContext);
