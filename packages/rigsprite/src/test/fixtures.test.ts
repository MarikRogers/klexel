import { expect, it } from 'vitest';
import { parseProject, serializeProject, createProject } from '../core/project';
import { makeImageAsset, makePart } from './fixtures';

it('fixtures apply overrides and form a valid project', () => {
  expect(makeImageAsset({ width: 1 })).toMatchObject({ width: 1, height: 40 });
  expect(makePart({ z: 3 })).toMatchObject({ z: 3, visible: true });

  const p = createProject('humanoid');
  const image = makeImageAsset();
  p.images[image.id] = image;
  p.parts.push(makePart({ imageId: image.id, boneId: p.rig.bones[0].id }));
  const r = parseProject(serializeProject(p));
  expect(r.ok && r.project.parts).toHaveLength(1);
});
