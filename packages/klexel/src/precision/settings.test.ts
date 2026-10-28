import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('parseSettings', () => {
  it('returns the defaults for a missing entry', () => {
    expect(parseSettings(null)).toEqual({ on: false, hand: 'R', pixelPerfect: true });
    expect(DEFAULT_SETTINGS).toEqual({ on: false, hand: 'R', pixelPerfect: true });
  });

  it('keeps defaults for fields that are missing', () => {
    expect(parseSettings('{"on":true}')).toEqual({ on: true, hand: 'R', pixelPerfect: true });
  });

  it('takes valid values over', () => {
    expect(parseSettings('{"hand":"L","pixelPerfect":false}')).toEqual({ on: false, hand: 'L', pixelPerfect: false });
  });

  it('falls back per field on invalid data', () => {
    expect(parseSettings('xyz')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"hand":"X","on":1,"pixelPerfect":"no"}')).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through JSON', () => {
    const s = { on: true, hand: 'L' as const, pixelPerfect: false };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });

  it('does not copy unknown fields', () => {
    expect(Object.keys(parseSettings('{"on":true,"evil":1}')).sort()).toEqual(['hand', 'on', 'pixelPerfect']);
  });
});
