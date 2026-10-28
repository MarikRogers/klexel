// Leichte Beschreibung des Bereichs Rigsprite für die Suite (ohne React und Editor; der kommt erst mit load()).
import type { AreaDescriptor } from '@suite/shared';
import { createProject, parseProjectData, type Project } from './core/project';
import { projectChangeKey } from './changeKey';
import { AREA_MARKER } from './marker';

/** Wartezeit der Hülle bis zum Sichern nach einer Änderung */
export const RIGSPRITE_AUTOSAVE_DELAY_MS = 500;

export const rigspriteDescriptor: AreaDescriptor<Project> & { marker: string } = {
  kind: 'rigsprite',
  title: 'Rigsprite',
  marker: AREA_MARKER,
  load: () => import('./area').then((m) => m.rigspriteArea),
  // Größe und Bild aus init passen nicht zu einem Rig-Projekt: immer das Humanoid-Rig
  blank: () => createProject('humanoid'),
  decode: (raw) => {
    const r = parseProjectData(raw);
    return r.ok ? r.project : null;
  },
  changeKey: projectChangeKey,
  // Rigsprite meldet jede Projektänderung sofort (auch Tastendruck in Feldern): Sichern gedrosselt, damit nicht
  // jede Änderung einen vollen Schreibvorgang (samt eingebetteter Bilder und Vorschau) auslöst
  autosaveDelayMs: RIGSPRITE_AUTOSAVE_DELAY_MS,
  // Kein readLegacy: der alte Autosave des eigenständigen Rigsprite liegt auf einer anderen Adresse (Origin).
};
