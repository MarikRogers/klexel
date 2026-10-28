// Leichte Beschreibung des Bereichs Rigsprite für die Suite (ohne React und Editor; der kommt erst mit load()).
import type { AreaDescriptor } from '@suite/shared';
import { createProject, parseProjectData, type Project } from './core/project';
import { projectChangeKey } from './changeKey';
import { AREA_MARKER } from './marker';

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
  // Kein readLegacy: der alte Autosave des eigenständigen Rigsprite liegt auf einer anderen Adresse (Origin).
};
