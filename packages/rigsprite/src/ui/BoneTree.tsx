import { useState } from 'react';
import { boneById, type Bone } from '../core/rig';
import { useEditor } from '../state/store';

function Node({ bone, bones, depth }: { bone: Bone; bones: Bone[]; depth: number }) {
  const selected = useEditor((s) => s.selectedBoneId === bone.id);
  const children = bones.filter((b) => b.parentId === bone.id);
  return (
    <>
      <li>
        <button
          className={selected ? 'bone-item selected' : 'bone-item'}
          style={{ paddingLeft: 6 + depth * 12 }}
          aria-pressed={selected}
          onClick={() => useEditor.getState().select(bone.id)}
        >
          {bone.name}
        </button>
      </li>
      {children.map((c) => (
        <Node key={c.id} bone={c} bones={bones} depth={depth + 1} />
      ))}
    </>
  );
}

export function BoneTree() {
  const bones = useEditor((s) => s.project.rig.bones);
  const selectedBoneId = useEditor((s) => s.selectedBoneId);
  const [error, setError] = useState('');
  const selected = boneById({ bones }, selectedBoneId);
  const roots = bones.filter((b) => b.parentId === null);

  return (
    <section className="panel">
      <h2>Bones</h2>
      <div className="row">
        <button
          onClick={() => {
            const id = useEditor.getState().addBone(selected ? selected.id : null);
            useEditor.getState().select(id);
            setError('');
          }}
        >
          Bone hinzufügen
        </button>
        <button
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            if (selected.parentId === null) setError('Der Wurzel-Bone kann nicht gelöscht werden.');
            else {
              useEditor.getState().removeBone(selected.id);
              setError('');
            }
          }}
        >
          Bone löschen
        </button>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <ul className="bone-tree">
        {roots.map((r) => (
          <Node key={r.id} bone={r} bones={bones} depth={0} />
        ))}
      </ul>
    </section>
  );
}
