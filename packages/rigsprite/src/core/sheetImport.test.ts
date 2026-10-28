import { describe, expect, it } from 'vitest';
import { dedupeNames, gridRects, MAX_IMPORT_CELLS, parseAtlas } from './sheetImport';

describe('gridRects', () => {
  it('size mode yields only full cells', () => {
    const r = gridRects(100, 64, { mode: 'size', cellW: 32, cellH: 32 }, 'a');
    expect(r).toHaveLength(6);
    expect(r.map((c) => c.x)).toEqual([0, 32, 64, 0, 32, 64]);
    expect(r.every((c) => c.x + c.w <= 100)).toBe(true);
    expect(r[0].name).toBe('a_0');
  });
  it('count mode with margin and spacing', () => {
    const r = gridRects(128, 64, { mode: 'count', cols: 4, rows: 2, margin: 2, spacing: 2 }, 'a');
    expect(r).toHaveLength(8);
    expect(r[0]).toMatchObject({ w: 29, h: 29 });
    expect(r[1].x).toBe(33);
  });
  it('invalid options give []', () => {
    expect(gridRects(100, 100, { mode: 'count', cols: 0, rows: 2 }, 'a')).toEqual([]);
    expect(gridRects(100, 100, { mode: 'size', cellW: 0, cellH: 2 }, 'a')).toEqual([]);
  });
});

describe('parseAtlas', () => {
  it('aseprite hash', () => {
    const r = parseAtlas(
      JSON.stringify({ frames: { 'head.png': { frame: { x: 0, y: 0, w: 8, h: 8 } } }, meta: { image: 's.png' } }),
    );
    expect(r).toEqual({ ok: true, rects: [{ name: 'head', x: 0, y: 0, w: 8, h: 8 }], skipped: 0, imageName: 's.png' });
  });
  it('texturepacker array', () => {
    const r = parseAtlas(
      JSON.stringify({ frames: [{ filename: 'arm/upperArm_L.png', frame: { x: 1, y: 2, w: 3, h: 4 } }] }),
    );
    expect(r.ok && r.rects[0].name).toBe('upperArm_L');
  });
  it('rotated is an error', () => {
    const r = parseAtlas(JSON.stringify({ frames: { a: { frame: { x: 0, y: 0, w: 1, h: 1 }, rotated: true } } }));
    expect(r).toEqual({ ok: false, error: 'Gedrehte Frames werden nicht unterstützt' });
  });
  it('bad json / unknown format', () => {
    const a = parseAtlas('{');
    expect(!a.ok && a.error).toContain('kein gültiges JSON');
    const b = parseAtlas('{"foo":1}');
    expect(!b.ok && b.error).toContain('Unbekanntes Atlas-Format');
  });
});

describe('caps and validation', () => {
  it('gridRects caps the cell count without allocating', () => {
    expect(gridRects(8192, 8192, { mode: 'size', cellW: 1, cellH: 1 }, 'a')).toEqual([]);
    expect(gridRects(8192, 8192, { mode: 'count', cols: 100, rows: 100 }, 'a')).toEqual([]);
    expect(gridRects(1024, 1, { mode: 'size', cellW: 1, cellH: 1 }, 'a')).toHaveLength(MAX_IMPORT_CELLS);
  });
  it('parseAtlas rejects too many frames', () => {
    const frames: Record<string, unknown> = {};
    for (let i = 0; i <= MAX_IMPORT_CELLS; i++) frames['f' + i] = { frame: { x: 0, y: 0, w: 1, h: 1 } };
    const r = parseAtlas(JSON.stringify({ frames }));
    expect(!r.ok && r.error).toContain('Zu viele Zellen');
  });
  it('parseAtlas skips invalid rects and counts them', () => {
    const f = (x: number, y: number, w: number, h: number) => ({ frame: { x, y, w, h } });
    const r = parseAtlas(
      JSON.stringify({ frames: { a: f(0, 0, 0, 4), b: f(-1, 0, 4, 4), c: f(0.5, 0, 4, 4), d: f(0, 0, 4, 4) } }),
    );
    expect(r.ok && r.skipped).toBe(3);
    expect(r.ok && r.rects.map((x) => x.name)).toEqual(['d']);
  });
  it('parseAtlas handles a __proto__ key', () => {
    const r = parseAtlas('{"frames":{"__proto__":{"frame":{"x":0,"y":0,"w":4,"h":4}}}}');
    expect(r.ok && r.rects).toEqual([{ name: '__proto__', x: 0, y: 0, w: 4, h: 4 }]);
  });
  it('empty base names fall back to sprite', () => {
    const fr = { frame: { x: 0, y: 0, w: 1, h: 1 } };
    const r = parseAtlas(JSON.stringify({ frames: { 'a/': fr, '.png': fr } }));
    expect(r.ok && r.rects.map((x) => x.name)).toEqual(['sprite', 'sprite']);
  });
});

describe('dedupeNames', () => {
  it('suffixes duplicates', () => {
    const r = dedupeNames([1, 2, 3].map(() => ({ name: 'a', x: 0, y: 0, w: 1, h: 1 })));
    expect(r.map((x) => x.name)).toEqual(['a', 'a_2', 'a_3']);
  });
});
