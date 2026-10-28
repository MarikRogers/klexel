import { useEffect, useState } from 'react';
import { restoreAutosave, startAutosave } from '../state/persistence';
import { useEditor } from '../state/store';
import { BoneTree } from './BoneTree';
import { importFiles } from './importFiles';
import { Inspector } from './Inspector';
import { useEscape, useGlobalShortcuts } from './shortcuts';
import { SpritesPanel } from './SpritesPanel';
import { Timeline } from './Timeline';
import { Toolbar } from './Toolbar';
import { Viewport } from './Viewport';
import { SuiteContext, type SuiteBridge } from './suiteBridge';
import './app.css';

/** The standalone app: restores and keeps its own autosave, then shows the editor. */
export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void restoreAutosave().then((restored) => {
      if (cancelled) return;
      if (!restored) useEditor.getState().newProject('humanoid');
      stop = startAutosave();
      setReady(true);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  if (!ready) return null;
  return <AppView />;
}

/** The editor without persistence (the suite saves through its workspace); `suite` connects it to the suite. */
export function AppView({ suite = null }: { suite?: SuiteBridge | null }) {
  const [dropErrors, setDropErrors] = useState<string[]>([]);
  // Phone layout (< 768 px): the side panels are overlays toggled from the panel bar.
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const closeDrawers = () => {
    setLeftOpen(false);
    setRightOpen(false);
  };
  useGlobalShortcuts();
  useEscape(leftOpen || rightOpen, closeDrawers);

  return (
    <SuiteContext.Provider value={suite}>
      <div className={`app${leftOpen ? ' left-open' : ''}${rightOpen ? ' right-open' : ''}`}>
        <Toolbar />
        <div className="panel-bar">
          <button aria-expanded={leftOpen} onClick={() => setLeftOpen((o) => !o)}>
            Bones &amp; Sprites
          </button>
          <button aria-expanded={rightOpen} onClick={() => setRightOpen((o) => !o)}>
            Inspector
          </button>
        </div>
        {(leftOpen || rightOpen) && (
          <div
            className="drawer-scrim"
            data-testid="drawer-scrim"
            onClick={closeDrawers}
          />
        )}
        <aside className="left">
          <BoneTree />
          <SpritesPanel />
        </aside>
        <main
          className="center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void importFiles(Array.from(e.dataTransfer.files)).then(setDropErrors);
          }}
        >
          <Viewport />
          {dropErrors.length > 0 && (
            <div role="alert" className="error drop-error">
              {dropErrors.map((m, i) => (
                <div key={i}>{m}</div>
              ))}
            </div>
          )}
        </main>
        <aside className="right">
          <Inspector />
        </aside>
        <footer className="timeline">
          <Timeline />
        </footer>
      </div>
    </SuiteContext.Provider>
  );
}
