import { useRef, useState } from 'react';
import type { SpriteAxis } from '../core/part';
import { createProject, projectHasContent } from '../core/project';
import { downloadProject, openProjectFile, readProjectFile } from '../state/persistence';
import { useEditor } from '../state/store';
import { CameraControls } from './CameraControls';
import { CommitInput } from './CommitInput';
import { ExportDialog } from './ExportDialog';
import { NewProjectDialog } from './NewProjectDialog';
import { useSuite } from './suiteBridge';

function ProjectName() {
  const name = useEditor((s) => s.project.name);
  return (
    <CommitInput
      aria-label="Projektname"
      blurOnEnter
      value={name}
      onCommit={(text) => {
        const next = text.trim();
        if (next === '') return false;
        useEditor.getState().setProjectName(next);
      }}
    />
  );
}

export function Toolbar() {
  const mode = useEditor((s) => s.mode);
  const pixelArt = useEditor((s) => s.project.settings.pixelArt);
  const spriteAxis = useEditor((s) => s.project.settings.spriteAxis);
  const [dialog, setDialog] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const suite = useSuite();
  // In the suite "Neu" / "Öffnen" create a new workspace project: nothing is discarded.
  const confirmDiscard = () =>
    !!suite || !projectHasContent(useEditor.getState().project) || confirm('Aktuelles Projekt verwerfen?');
  const openFile = async (file: File) => {
    if (!suite) return setOpenError(await openProjectFile(file));
    const res = await readProjectFile(file);
    if (res.ok) suite.newProject(res.project);
    setOpenError(res.ok ? null : res.error);
  };
  const requestNew = () => {
    if (confirmDiscard()) setDialog(true);
  };
  const requestOpen = () => {
    if (confirmDiscard()) fileInput.current?.click();
  };

  return (
    <header className="toolbar">
      <img className="tb-logo" src={suite?.logoUrl ?? `${import.meta.env.BASE_URL}logo.png`} alt="RigSprite" width={24} height={24} />
      <div className="tb-group">
        {suite && (
          <button className="tb-projects" onClick={() => suite.openProjects()} title="Projekte">
            Projekte
          </button>
        )}
        <button onClick={requestNew}>Neu</button>
        <button onClick={requestOpen}>Öffnen</button>
        <button onClick={() => downloadProject(useEditor.getState().project)}>Speichern</button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept=".json,.rigsprite.json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void openFile(file);
          }}
        />
        <ProjectName />
        <button onClick={() => setExportOpen(true)}>Export</button>
      </div>
      <span className="sep" />
      <div className="tb-group">
        <button onClick={() => useEditor.getState().undo()} aria-label="Rückgängig" title="Rückgängig (Strg+Z)">
          ↶ Zurück
        </button>
        <button onClick={() => useEditor.getState().redo()} aria-label="Wiederholen" title="Wiederholen (Strg+Y)">
          ↷ Vor
        </button>
      </div>
      <span className="sep" />
      <div role="group" aria-label="Modus" className="tb-group">
        <button aria-pressed={mode === 'setup'} onClick={() => useEditor.getState().setMode('setup')}>
          Setup
        </button>
        <button aria-pressed={mode === 'animate'} onClick={() => useEditor.getState().setMode('animate')}>
          Animieren
        </button>
      </div>
      <span className="sep" />
      <div className="tb-group">
        <label>
          <input
            type="checkbox"
            checked={pixelArt}
            onChange={(e) => useEditor.getState().setSettings({ pixelArt: e.target.checked })}
          />{' '}
          Pixel-Art
        </label>
        <label title="Sprite-Richtung">
          <span aria-hidden="true">Richtung </span>
          <select
            aria-label="Sprite-Richtung"
            value={spriteAxis}
            onChange={(e) => useEditor.getState().setSpriteAxis(e.target.value as SpriteAxis)}
          >
            <option value="down">Oben → unten</option>
            <option value="up">Unten → oben</option>
            <option value="right">Links → rechts</option>
            <option value="left">Rechts → links</option>
          </select>
        </label>
      </div>
      <span className="sep" />
      <CameraControls />
      {openError && (
        <div role="alert" className="error open-error">
          {openError}{' '}
          <button onClick={() => setOpenError(null)} aria-label="Hinweis schließen">
            ×
          </button>
        </div>
      )}
      {dialog && (
        <NewProjectDialog
          onClose={() => setDialog(false)}
          onPick={suite ? (t) => suite.newProject(createProject(t)) : undefined}
        />
      )}
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </header>
  );
}
