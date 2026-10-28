import { describe, it, expect } from 'vitest';
import { sanitizeFileName } from './fileMenu';

describe('sanitizeFileName', () => {
  it('entfernt unzulässige Zeichen', () => {
    expect(sanitizeFileName('a\\b/c:d*e?"f<g>h|i')).toBe('abcdefghi');
  });
  it('fängt reservierte Windows-Namen ab', () => {
    for (const n of ['CON', 'nul', 'COM1', 'lpt9', 'aux.txt']) expect(sanitizeFileName(n)).toBe('_' + n);
    expect(sanitizeFileName('Console')).toBe('Console');
  });
  it('leer ergibt Projekt', () => {
    expect(sanitizeFileName('  ...')).toBe('Projekt');
    expect(sanitizeFileName('')).toBe('Projekt');
  });
});
