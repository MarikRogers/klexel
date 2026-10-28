import { describe, expect, it } from 'vitest';
import { RIG_TEMPLATES } from '../core/templates/rigs';
import { makePart } from '../test/fixtures';
import { instanceLabels } from './instanceLabels';

const rig = RIG_TEMPLATES.find((t) => t.id === 'humanoid')!.rig;

describe('instanceLabels', () => {
  it('uses plain bone names when all differ', () => {
    expect(instanceLabels([makePart({ id: 'a', boneId: 'head' }), makePart({ id: 'b', boneId: 'torso' })], rig)).toEqual(['head', 'torso']);
  });
  it('numbers repeated bones from the second one on', () => {
    const parts = ['a', 'b', 'c'].map((id) => makePart({ id, boneId: 'head' }));
    expect(instanceLabels(parts, rig)).toEqual(['head', 'head 2', 'head 3']);
  });
  it('shows ? for unknown bones and handles empty input', () => {
    expect(instanceLabels([makePart({ boneId: 'nope' })], rig)).toEqual(['?']);
    expect(instanceLabels([], rig)).toEqual([]);
  });
});
