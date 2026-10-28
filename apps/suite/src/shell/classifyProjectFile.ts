// Erkennt am Inhalt (nicht am Dateinamen), was eine geladene JSON-Datei ist.
export type ProjectFileKind = 'workspace' | 'rigsprite-project' | 'unknown';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Klexel-Workspace-Datei (`format: 'klexel-workspace'`) oder eigenständiges Rigsprite-Projekt (`*.rigsprite.json`). */
export function classifyProjectFile(parsed: unknown): ProjectFileKind {
  if (!isObj(parsed)) return 'unknown';
  if (parsed.format === 'klexel-workspace') return 'workspace';
  const rig = parsed.rig;
  if (
    typeof parsed.version === 'number' &&
    typeof parsed.name === 'string' &&
    typeof parsed.rigTemplateId === 'string' &&
    isObj(rig) && Array.isArray(rig.bones) &&
    isObj(parsed.images) &&
    Array.isArray(parsed.parts) &&
    Array.isArray(parsed.animations)
  ) return 'rigsprite-project';
  return 'unknown';
}
