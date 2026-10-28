import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { LinkedSyncSummary } from '../areaLogic';
import type { ImageAsset } from '../core/part';
import { boneById } from '../core/rig';
import { useEditor } from '../state/store';
import { instanceLabels } from './instanceLabels';
import { importFiles } from './importFiles';
import { ImportSheetDialog } from './ImportSheetDialog';
import { LinkSourceDialog } from './LinkSourceDialog';
import { useSuite } from './suiteBridge';

/** Short German summary of a manual refresh. */
export function syncMessage(s: LinkedSyncSummary): string {
  if (s.failed > 0) return 'Aktualisieren fehlgeschlagen – Klexel-Projekt nicht lesbar';
  const parts = [
    s.updated && `${s.updated} aktualisiert`,
    s.added && `${s.added} neu`,
    s.missing && `${s.missing} ohne Quelle`,
  ].filter(Boolean);
  return parts.length ? `Sprites: ${parts.join(', ')}` : 'Alle verknüpften Sprites sind aktuell';
}

const addedMessage = (n: number, name: string) =>
  n === 0
    ? `Alle Frames aus „${name}" sind bereits verknüpft`
    : `${n} ${n === 1 ? 'Sprite' : 'Sprites'} aus „${name}" hinzugefügt`;

/** Marker of a linked image ("↔ Klexel") and, if its source is gone, the "Quelle fehlt" badge. */
function LinkMarks({ img, sourceName }: { img: ImageAsset; sourceName?: string }) {
  if (!img.source) return null;
  const from = sourceName ? `Klexel-Projekt „${sourceName}"` : 'einem Klexel-Projekt';
  const frame = img.source.name ? `, Frame „${img.source.name}"` : '';
  return (
    <>
      <span className="sprite-link" role="img" title={`Verknüpft mit ${from}${frame}`} aria-label={`Verknüpft mit ${from}`}>
        ↔
      </span>
      {img.source.missing && (
        <span className="sprite-missing" title="Das Klexel-Projekt oder der Frame wurde gelöscht; das letzte Bild bleibt erhalten">
          Quelle fehlt
        </span>
      )}
    </>
  );
}

export function SpritesPanel() {
  const project = useEditor(
    useShallow((s) => ({ images: s.project.images, parts: s.project.parts, rig: s.project.rig })),
  );
  const selectedPartId = useEditor((s) => s.selectedPartId);
  const suite = useSuite();
  const sources = suite?.sources;
  const [errors, setErrors] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sourceNames, setSourceNames] = useState<Record<string, string>>({});
  const images = Object.values(project.images);
  const linkedKey = [...new Set(images.flatMap((i) => (i.source ? [i.source.projectId] : [])))].sort().join(' ');

  // Names of the linked Klexel projects for the markers' tooltips (current names from the project list)
  useEffect(() => {
    if (!sources || !linkedKey) return;
    let cancelled = false;
    sources.list().then(
      (metas) => {
        if (!cancelled) setSourceNames(Object.fromEntries(metas.map((m) => [m.id, m.name])));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [sources, linkedKey]);

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    setErrors(await importFiles(Array.from(list)));
  };

  const refresh = async () => {
    if (!suite?.syncSources) return;
    setSyncing(true);
    setMessage(null);
    try {
      setMessage(syncMessage(await suite.syncSources()));
    } catch (e) {
      console.error(e);
      setMessage('Aktualisieren fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="panel">
      <h2>Sprites</h2>
      <input
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        aria-label="Sprites hochladen"
        onChange={(e) => {
          const input = e.target;
          void onFiles(input.files).then(() => {
            input.value = '';
          });
        }}
      />
      <button onClick={() => setSheetOpen(true)}>Spritesheet importieren</button>
      {sources && (
        <div className="sprite-source-actions">
          <button onClick={() => setLinkOpen(true)}>Aus Klexel…</button>
          {linkedKey && suite?.syncSources && (
            <button disabled={syncing} onClick={() => void refresh()} title="Verknüpfte Sprites aus Klexel neu laden">
              Aktualisieren
            </button>
          )}
        </div>
      )}
      {sheetOpen && <ImportSheetDialog onClose={() => setSheetOpen(false)} />}
      {linkOpen && sources && (
        <LinkSourceDialog
          sources={sources}
          onClose={() => setLinkOpen(false)}
          onLinked={(n, name) => setMessage(addedMessage(n, name))}
        />
      )}
      {message && (
        <div role="status" className="sprite-message">
          {message}
        </div>
      )}
      {errors.length > 0 && (
        <div role="alert" className="error">
          {errors.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
      <ul className="sprite-list">
        {images.map((img) => {
          const parts = project.parts.filter((p) => p.imageId === img.id);
          const labels = instanceLabels(parts, project.rig);
          const boneOptions = project.rig.bones.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ));
          return (
            <li key={img.id} data-testid={`sprite-${img.name}`}>
              <img src={img.dataUrl} alt="" width={24} height={24} style={{ objectFit: 'contain' }} />
              <span className="sprite-name">{img.name}</span>
              <LinkMarks img={img} sourceName={img.source ? sourceNames[img.source.projectId] : undefined} />
              {parts.map((part, i) => {
                const boneName = boneById(project.rig, part.boneId)?.name ?? '?';
                return (
                  <span key={part.id} className="sprite-instance">
                    <button
                      className="sprite-bone"
                      aria-label={`${img.name} an ${boneName} auswählen`}
                      title="Teil auswählen"
                      aria-pressed={selectedPartId === part.id}
                      onClick={() => useEditor.getState().select(part.boneId, part.id)}
                    >
                      {labels[i]}
                    </button>
                    <button
                      className="sprite-instance-remove"
                      aria-label={`${img.name} von ${boneName} entfernen`}
                      title="Instanz entfernen (Sprite bleibt)"
                      onClick={() => useEditor.getState().removePart(part.id)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              <select
                aria-label={parts.length ? `Weiterer Bone für ${img.name}` : `Bone für ${img.name}`}
                value=""
                onChange={(e) => {
                  if (e.target.value) useEditor.getState().attachImage(img.id, e.target.value);
                }}
              >
                <option value="">{parts.length ? '+ Bone…' : '– nicht angehängt –'}</option>
                {boneOptions}
              </select>
              <button aria-label={`${img.name} entfernen`} onClick={() => useEditor.getState().removeImage(img.id)}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
