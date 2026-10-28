import { describe, it, expect } from 'vitest';
import { nextUntitledName, filterProjects, formatUpdated, parseSize, afterRemoveError, isOpenable, projectBadges, kindTitle, kindBadge, defaultNewKind, showKindChoice } from './listModel';
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

describe('Projekt-Arten in der Liste', () => {
  const rig: ProjectMeta = { id: 'R', kind: 'rigsprite', name: 'R', updatedAt: 0 };
  it('Anzeigename: Beschreibung, sonst bekannt, sonst die Art', () => {
    expect(kindTitle('klexel')).toBe('Klexel');
    expect(kindTitle('rigsprite')).toBe('Rigsprite');
    expect(kindTitle('rigsprite', { rigsprite: 'RigSprite' })).toBe('RigSprite');
    expect(kindTitle('foo')).toBe('foo');
  });
  it('Art-Kennzeichen nur bei mehreren Bereichen oder nicht verfügbarem Projekt', () => {
    expect(kindBadge(meta('A'), ['klexel'], true)).toBeNull();
    expect(kindBadge(rig, ['klexel'], false)).toBe('Rigsprite');
    expect(kindBadge(meta('A'), ['klexel', 'rigsprite'], true)).toBe('Klexel');
    expect(kindBadge(rig, ['klexel', 'rigsprite'], true)).toBe('Rigsprite');
  });
  it('Kennzeichen: Art zuerst, dann „geöffnet"/„nicht verfügbar"', () => {
    expect(projectBadges(rig, 'R', true, 'Rigsprite')).toEqual([{ text: 'Rigsprite', off: false, kind: true }, { text: 'geöffnet', off: false }]);
    expect(projectBadges(rig, null, false, 'Rigsprite')).toEqual([{ text: 'Rigsprite', off: false, kind: true }, { text: 'nicht verfügbar', off: true }]);
    expect(projectBadges(rig, null, true, null)).toEqual([]);
  });
  it('Vorgewählte Art für „Neues Projekt"', () => {
    expect(defaultNewKind('rigsprite', ['klexel', 'rigsprite'])).toBe('rigsprite');
    expect(defaultNewKind('klexel', ['klexel', 'rigsprite'])).toBe('klexel');
    expect(defaultNewKind(null, ['klexel', 'rigsprite'])).toBe('klexel');
    expect(defaultNewKind('rigsprite', ['klexel'])).toBe('klexel');
    expect(defaultNewKind(null, ['rigsprite'])).toBe('rigsprite');
  });
  it('Artwahl nur bei mehreren Bereichen', () => {
    expect(showKindChoice(['klexel'])).toBe(false);
    expect(showKindChoice(['rigsprite'])).toBe(false);
    expect(showKindChoice(['klexel', 'rigsprite'])).toBe(true);
  });
});
