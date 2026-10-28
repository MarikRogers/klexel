import { describe, it, expect } from 'vitest';
import { nextUntitledName, filterProjects, formatUpdated, parseSize, afterRemoveError, isOpenable, projectBadges } from './listModel';
import type { ProjectMeta } from '@suite/shared';

const meta = (name: string): ProjectMeta => ({ id: name, kind: 'klexel', name, updatedAt: 0 });

describe('nextUntitledName', () => {
  it('erster Name ohne Nummer, danach fortlaufend', () => {
    expect(nextUntitledName([])).toBe('Unbenannt');
    expect(nextUntitledName(['Mein Bild'])).toBe('Unbenannt');
    expect(nextUntitledName(['Unbenannt'])).toBe('Unbenannt 2');
    expect(nextUntitledName(['Unbenannt', 'Unbenannt 2', 'Unbenannt 4'])).toBe('Unbenannt 3');
  });
});

describe('filterProjects', () => {
  const l = [meta('Katze'), meta('Hund'), meta('katzenklo')];
  it('leere Suche liefert alles', () => {
    expect(filterProjects(l, '  ')).toHaveLength(3);
  });
  it('sucht ohne Groß-/Kleinschreibung im Namen', () => {
    expect(filterProjects(l, 'KATZ').map(m => m.name)).toEqual(['Katze', 'katzenklo']);
    expect(filterProjects(l, ' hu ')).toHaveLength(1);
    expect(filterProjects(l, 'x')).toHaveLength(0);
  });
});

describe('formatUpdated', () => {
  const now = new Date(2026, 9, 28, 15, 30).getTime();
  it('heute mit Uhrzeit', () => {
    expect(formatUpdated(new Date(2026, 9, 28, 9, 5).getTime(), now)).toBe('Heute, 09:05');
  });
  it('gestern mit Uhrzeit', () => {
    expect(formatUpdated(new Date(2026, 9, 27, 23, 59).getTime(), now)).toBe('Gestern, 23:59');
  });
  it('älter als Datum', () => {
    expect(formatUpdated(new Date(2026, 0, 3, 12, 0).getTime(), now)).toBe('03.01.2026');
  });
});

describe('parseSize', () => {
  it('ganze Zahlen 1..128', () => {
    expect(parseSize('32')).toBe(32);
    expect(parseSize('1')).toBe(1);
    expect(parseSize('128')).toBe(128);
  });
  it('ungültig → null', () => {
    expect(parseSize('0')).toBeNull();
    expect(parseSize('129')).toBeNull();
    expect(parseSize('')).toBeNull();
    expect(parseSize('abc')).toBeNull();
    expect(parseSize('3.5')).toBeNull();
  });
});

describe('afterRemoveError', () => {
  it('Projekt noch vorhanden → wiederherstellen', () => {
    expect(afterRemoveError('A', [meta('A'), meta('B')])).toBe('restore');
  });
  it('Liste nicht lesbar → wiederherstellen (sichern auf gelöschte ID ist ein No-op)', () => {
    expect(afterRemoveError('A', null)).toBe('restore');
  });
  it('Projekt schon entfernt → anderes öffnen', () => {
    expect(afterRemoveError('A', [meta('B')])).toBe('fallback');
    expect(afterRemoveError('A', [])).toBe('fallback');
  });
});

describe('Arten ohne Bereich', () => {
  const rig: ProjectMeta = { id: 'R', kind: 'rigsprite', name: 'Rig', updatedAt: 0 };
  it('Projekt einer Art ohne Bereich ist nicht öffenbar und als „nicht verfügbar" gekennzeichnet', () => {
    expect(isOpenable(rig, ['klexel'])).toBe(false);
    expect(isOpenable(meta('A'), ['klexel'])).toBe(true);
    expect(projectBadges(rig, 'A', isOpenable(rig, ['klexel']))).toEqual([{ text: 'nicht verfügbar', off: true }]);
  });
  it('geöffnetes, verfügbares Projekt: nur „geöffnet"', () => {
    expect(projectBadges(meta('A'), 'A', true)).toEqual([{ text: 'geöffnet', off: false }]);
    expect(projectBadges(meta('A'), 'B', true)).toEqual([]);
  });
});
