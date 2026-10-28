import type { RigTemplateId } from '../core/rig';
import { RIG_TEMPLATES } from '../core/templates/rigs';
import { useEditor } from '../state/store';

/** `onPick` replaces the default (start a new project in place), e.g. in the suite: a new workspace project. */
export function NewProjectDialog({ onClose, onPick }: { onClose: () => void; onPick?: (t: RigTemplateId) => void }) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-label="Neues Projekt">
        <h2>Neues Projekt</h2>
        <p>Rig-Vorlage wählen:</p>
        <div className="dialog-templates">
          {RIG_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (onPick) onPick(t.id);
                else useEditor.getState().newProject(t.id);
                onClose();
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
        <button onClick={onClose}>Abbrechen</button>
      </div>
    </div>
  );
}
