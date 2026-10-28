import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { boneById } from '../core/rig';
import { useEditor } from '../state/store';
import { importFiles } from './importFiles';
import { ImportSheetDialog } from './ImportSheetDialog';

export function SpritesPanel() {
  const project = useEditor(
    useShallow((s) => ({ images: s.project.images, parts: s.project.parts, rig: s.project.rig })),
  );
  const selectedPartId = useEditor((s) => s.selectedPartId);
  const [errors, setErrors] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const images = Object.values(project.images);

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    setErrors(await importFiles(Array.from(list)));
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
      {sheetOpen && <ImportSheetDialog onClose={() => setSheetOpen(false)} />}
      {errors.length > 0 && (
        <div role="alert" className="error">
          {errors.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
      <ul className="sprite-list">
        {images.map((img) => {
          const part = project.parts.find((p) => p.imageId === img.id);
          const bone = part ? boneById(project.rig, part.boneId) : undefined;
          return (
            <li key={img.id} data-testid={`sprite-${img.name}`}>
              <img src={img.dataUrl} alt="" width={24} height={24} style={{ objectFit: 'contain' }} />
              <span className="sprite-name">{img.name}</span>
              {part ? (
                <button
                  className="sprite-bone"
                  aria-label={`${img.name} auswählen`}
                  title="Teil auswählen"
                  aria-pressed={selectedPartId === part.id}
                  onClick={() => useEditor.getState().select(part.boneId, part.id)}
                >
                  {bone?.name ?? '?'}
                </button>
              ) : (
                <select
                  aria-label={`Bone für ${img.name}`}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) useEditor.getState().attachImage(img.id, e.target.value);
                  }}
                >
                  <option value="">– nicht angehängt –</option>
                  {project.rig.bones.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
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
