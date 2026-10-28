import { describe, it, expect } from 'vitest';
import { frameLabel } from './frameLabel';

describe('frameLabel', () => {
  it('nimmt den Namen, sonst die Nummer', () => {
    expect(frameLabel({ id: 7, name: 'Lauf' }, 0)).toBe('Lauf');
    expect(frameLabel({ id: 7 }, 2)).toBe('3');
    expect(frameLabel({ id: 7, name: '' }, 0)).toBe('1');
  });
});
