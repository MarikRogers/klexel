import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from './id';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe('newId', () => {
  it('falls back to getRandomValues without randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = newId();
      expect(id).toMatch(V4);
      ids.add(id);
    }
    expect(ids.size).toBe(1000);
  });
  it('delegates to randomUUID when present', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed', getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(newId()).toBe('fixed');
  });
});
