import { useEffect, useRef, useState } from 'react';
import { autoThickness, boneById } from '../core/rig';
import { isBoneNameTaken, useEditor } from '../state/store';
import { CommitInput, parseNumber } from './CommitInput';
import { DepthPanel } from './DepthPanel';

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <CommitInput
        type="number"
        value={String(value)}
        onCommit={(text) => {
          const n = parseNumber(text);
          if (n === null) return false;
          onCommit(n);
        }}
      />
    </label>
  );
}

function NameField({ boneId, name }: { boneId: string; name: string }) {
  const [hint, setHint] = useState<string | null>(null);
  return (
    <>
      <CommitInput
        type="text"
        value={name}
        onCommit={(text) => {
          const t = text.trim();
          if (!t || t === name) return false;
          if (isBoneNameTaken(useEditor.getState().project.rig.bones, boneId, t)) {
            setHint('Name bereits vergeben');
            return false;
          }
          setHint(null);
          useEditor.getState().updateBone(boneId, { name: t });
        }}
      />
      {hint && (
        <span role="status" className="hint">
          {hint}
        </span>
      )}
    </>
  );
}

/** Colour picker that commits once when the picker closes (native `change`), not on every drag step. */
function ColorInput({ value, onCommit }: { value: string; onCommit: (c: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => commit.current(el.value);
    el.addEventListener('change', on);
    return () => el.removeEventListener('change', on);
  }, []);
  return <input ref={ref} type="color" aria-label="Farbe" defaultValue={value} />;
}

export function Inspector() {
  // Only the selected bone / part: edits elsewhere in the project do not re-render the inspector.
  const bone = useEditor((s) => boneById(s.project.rig, s.selectedBoneId));
  const part = useEditor((s) => s.project.parts.find((p) => p.id === s.selectedPartId));
  const { updateBone, updatePart, removePart } = useEditor.getState();

  return (
    <section className="panel">
      <h2>Inspector</h2>
      {bone && (
        <div aria-label="Bone-Inspector" role="group">
          <h3>Bone</h3>
          <label className="field">
            <span>Name</span>
            <NameField key={bone.id} boneId={bone.id} name={bone.name} />
          </label>
          <NumberField label="x" value={bone.x} onCommit={(v) => updateBone(bone.id, { x: v })} />
          <NumberField label="y" value={bone.y} onCommit={(v) => updateBone(bone.id, { y: v })} />
          <NumberField label="Rotation" value={bone.rotation} onCommit={(v) => updateBone(bone.id, { rotation: v })} />
          <NumberField label="Länge" value={bone.length} onCommit={(v) => updateBone(bone.id, { length: v })} />
          <NumberField
            label="Dicke"
            value={bone.thickness ?? autoThickness(bone)}
            onCommit={(v) => updateBone(bone.id, { thickness: v })}
          />
          <label className="field">
            <span>Farbe</span>
            <ColorInput key={`${bone.id}:${bone.color ?? ''}`} value={bone.color ?? '#c8d2e6'} onCommit={(c) => updateBone(bone.id, { color: c })} />
            {bone.color && <button onClick={() => updateBone(bone.id, { color: undefined })}>Standard</button>}
          </label>
          <NumberField
            label="Gelenk-Weichheit"
            value={bone.softness}
            onCommit={(v) => updateBone(bone.id, { softness: v })}
          />
        </div>
      )}
      {part && (
        <div aria-label="Teil-Inspector" role="group">
          <h3>Teil</h3>
          <NumberField label="x" value={part.x} onCommit={(v) => updatePart(part.id, { x: v })} />
          <NumberField label="y" value={part.y} onCommit={(v) => updatePart(part.id, { y: v })} />
          <NumberField label="Rotation" value={part.rotation} onCommit={(v) => updatePart(part.id, { rotation: v })} />
          <NumberField label="Skalierung X" value={part.scaleX} onCommit={(v) => updatePart(part.id, { scaleX: v })} />
          <NumberField label="Skalierung Y" value={part.scaleY} onCommit={(v) => updatePart(part.id, { scaleY: v })} />
          <NumberField label="z" value={part.z} onCommit={(v) => updatePart(part.id, { z: v })} />
          <div className="row">
            <button onClick={() => updatePart(part.id, { z: part.z + 1 })}>nach vorn</button>
            <button onClick={() => updatePart(part.id, { z: part.z - 1 })}>nach hinten</button>
          </div>
          <label className="field">
            <span>Sichtbar</span>
            <input
              type="checkbox"
              checked={part.visible}
              onChange={(e) => updatePart(part.id, { visible: e.target.checked })}
            />
          </label>
          <button onClick={() => removePart(part.id)}>Entfernen</button>
        </div>
      )}
      <DepthPanel />
      {!bone && !part && <p className="hint">Nichts ausgewählt.</p>}
    </section>
  );
}
