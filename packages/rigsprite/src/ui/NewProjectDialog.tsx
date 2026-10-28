import { RIG_TEMPLATES } from '../core/templates/rigs';
import { useEditor } from '../state/store';

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
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
                useEditor.getState().newProject(t.id);
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
