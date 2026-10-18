import { describe, it, expect } from 'vitest';
import { PrecisionSession, type Effects } from './PrecisionSession';
import type { Pt } from '../draw/pixelPerfect';

class Fake implements Effects {
  log: string[] = [];
  isBlocked = false;
  noChange = false;
  color = 7;
  blocked() { this.log.push('blocked?'); return this.isBlocked; }
  strokeBegin() { this.log.push('begin'); }
  strokePoint(x: number, y: number) { this.log.push(`point:${x},${y}`); }
  strokeEnd(commit: boolean) { this.log.push(`end:${commit}`); return commit && !this.noChange; }
  fill(x: number, y: number) { this.log.push(`fill:${x},${y}`); return !this.noChange; }
  pick(x: number, y: number) { this.log.push(`pick:${x},${y}`); this.color = 99; }
  shapePreview(a: Pt, b: Pt) { this.log.push(`preview:${a}>${b}`); }
  shapeCommit() { this.log.push('commit'); }
  shapeCancel() { this.log.push('cancelShape'); }
  dropLast() { this.log.push('dropLast'); }
  getColor() { return this.color; }
  setColor(c: number) { this.color = c; this.log.push(`setColor:${c}`); }
  say(text: string) { this.log.push(`say:${text}`); }
  changed() { /* Anzeige aktualisieren, hier ohne Wirkung */ }
  /** Aufrufe ohne die Abfrage blocked? */
  get calls() { return this.log.filter(l => l !== 'blocked?'); }
}

const map = (x: number, y: number): Pt => [Math.floor(x / 10), Math.floor(y / 10)];

function make(tool = 'pen') {
  const fx = new Fake();
  const s = new PrecisionSession(fx, map);
  s.setTool(tool);
  return { fx, s };
}

function tap(s: PrecisionSession, x: number, y: number, t0: number, dur = 80) {
  s.down(x, y, t0); s.up(x, y, t0 + dur);
}

describe('PrecisionSession: Bewegen', () => {
  it('move mode: touch moves the cursor and triggers no effect', () => {
    const { fx, s } = make();
    s.down(55, 35, 0); s.move(95, 75); s.up(95, 75, 500);
    expect(s.cursor).toEqual([9, 7]);
    expect(fx.calls).toEqual([]);
  });

  it('the cursor stays after lifting the finger', () => {
    const { s } = make();
    s.down(20, 20, 0); s.move(60, 60); s.up(60, 60, 400);
    expect(s.cursor).toEqual([6, 6]);
  });

  it('reset() puts the cursor on the given cell, mode move', () => {
    const { s } = make();
    s.setMode('draw');
    s.reset([4, 5]);
    expect(s.cursor).toEqual([4, 5]);
    expect(s.mode).toBe('move');
  });

  it('up and move without down are ignored', () => {
    const { fx, s } = make();
    s.setMode('draw');
    fx.log.length = 0;
    s.move(50, 50); s.up(50, 50, 10);
    expect(fx.calls).toEqual([]);
  });

  it('select tool: inactive, down/move/up cause no effect', () => {
    const { fx, s } = make('select');
    expect(s.active).toBe(false);
    s.down(10, 10, 0); s.move(50, 50); s.up(50, 50, 100);
    expect(fx.calls).toEqual([]);
  });
});

describe('PrecisionSession: Stift im Modus Zeichnen', () => {
  it('drag draws from the first cell and ends with one strokeEnd(true)', () => {
    const { fx, s } = make();
    s.setMode('draw'); fx.log.length = 0;
    s.down(15, 15, 0); s.move(16, 15); s.move(45, 15); s.move(75, 15); s.up(75, 15, 500);
    expect(fx.calls).toEqual(['begin', 'point:1,1', 'point:4,1', 'point:7,1', 'end:true']);
  });

  it('tap paints one pixel', () => {
    const { fx, s } = make();
    s.setMode('draw'); fx.log.length = 0;
    tap(s, 35, 45, 0);
    expect(fx.calls).toEqual(['begin', 'point:3,4', 'end:true']);
  });

  it('double tap drops the first tap, discards the second stroke and leaves draw mode', () => {
    const { fx, s } = make();
    s.setMode('draw'); fx.log.length = 0;
    tap(s, 35, 45, 0); tap(s, 36, 45, 150);
    expect(s.mode).toBe('move');
    expect(fx.calls.filter(l => l === 'dropLast').length).toBe(1);
    expect(fx.calls.filter(l => l === 'end:true').length).toBe(1);
    expect(fx.calls.filter(l => l === 'end:false').length).toBe(1);
    expect(fx.calls).toContain('say:Zeichenmodus AUS');
  });

  it('double tap in move mode switches to draw without any drawing', () => {
    const { fx, s } = make();
    tap(s, 35, 45, 0); tap(s, 35, 45, 150);
    expect(s.mode).toBe('draw');
    expect(fx.calls).toEqual(['say:Zeichenmodus AN']);
  });

  it('a second tap after 351 ms is a normal tap', () => {
    const { fx, s } = make();
    s.setMode('draw'); fx.log.length = 0;
    tap(s, 35, 45, 0); tap(s, 35, 45, 351);
    expect(s.mode).toBe('draw');
    expect(fx.calls.filter(l => l === 'dropLast').length).toBe(0);
    expect(fx.calls.filter(l => l === 'end:true').length).toBe(2);
  });

  it('cancel() mid-stroke calls strokeEnd(false) once and keeps the cursor', () => {
    const { fx, s } = make();
    s.setMode('draw'); fx.log.length = 0;
    s.down(15, 15, 0); s.move(60, 15);
    s.cancel();
    expect(fx.calls.filter(l => l === 'end:false').length).toBe(1);
    expect(fx.calls.filter(l => l === 'end:true').length).toBe(0);
    expect(s.cursor).toEqual([6, 1]);
    s.up(60, 15, 300);
    expect(fx.calls.filter(l => l.startsWith('end')).length).toBe(1);
  });

  it('eraser keeps the mode when switching from pen', () => {
    const { s } = make('pen');
    s.setMode('draw');
    s.setTool('eraser');
    expect(s.mode).toBe('draw');
  });
});

describe('PrecisionSession: Tipp ohne Änderung', () => {
  it('a tap that changed nothing is not dropped by a double tap (no unrelated undo step is lost)', () => {
    const { fx, s } = make('pen');
    s.setMode('draw'); fx.noChange = true; fx.log.length = 0;
    tap(s, 35, 45, 0); tap(s, 35, 45, 150);
    expect(fx.calls.filter(l => l === 'dropLast').length).toBe(0);
    expect(s.mode).toBe('move');
  });

  it('a fill that changed nothing is not dropped by a double tap', () => {
    const { fx, s } = make('fill');
    s.setMode('draw'); fx.noChange = true; fx.log.length = 0;
    tap(s, 35, 35, 0); tap(s, 35, 35, 150);
    expect(fx.calls.filter(l => l === 'dropLast').length).toBe(0);
  });
});

describe('PrecisionSession: Füllen und Pipette', () => {
  it('fill acts on release only in draw mode, once per touch', () => {
    const { fx, s } = make('fill');
    s.down(25, 25, 0); s.move(75, 75); s.up(75, 75, 500);
    expect(fx.calls).toEqual([]);
    s.setMode('draw'); fx.log.length = 0;
    s.down(25, 25, 1000); s.move(75, 75);
    expect(fx.calls).toEqual([]);
    s.up(75, 75, 1500);
    expect(fx.calls).toEqual(['fill:7,7']);
  });

  it('double tap after fill drops the fill', () => {
    const { fx, s } = make('fill');
    s.setMode('draw'); fx.log.length = 0;
    tap(s, 35, 35, 0); tap(s, 35, 35, 150);
    expect(fx.calls).toEqual(['fill:3,3', 'dropLast', 'say:Zeichenmodus AUS']);
  });

  it('picker picks on release; double tap restores the previous color', () => {
    const { fx, s } = make('picker');
    s.setMode('draw'); fx.log.length = 0;
    tap(s, 35, 35, 0);
    expect(fx.calls).toEqual(['pick:3,3']);
    expect(fx.color).toBe(99);
    tap(s, 35, 35, 150);
    expect(fx.color).toBe(7);
    expect(fx.calls).toContain('setColor:7');
  });
});

describe('PrecisionSession: Formen', () => {
  it('entering draw sets the anchor, moving updates the end, leaving draw commits', () => {
    const { fx, s } = make('rect');
    s.down(25, 25, 0); s.up(25, 25, 500); fx.log.length = 0;
    s.setMode('draw');
    expect(fx.calls).toEqual(['preview:2,2>2,2', 'say:Zeichenmodus AN']);
    fx.log.length = 0;
    s.down(55, 65, 1000); s.move(75, 85); s.up(75, 85, 1500);
    expect(fx.calls).toEqual(['preview:2,2>5,6', 'preview:2,2>7,8']);
    fx.log.length = 0;
    s.setMode('move');
    expect(fx.calls).toEqual(['commit', 'say:Zeichenmodus AUS']);
  });

  it('cancel() discards the preview and returns to move', () => {
    const { fx, s } = make('line');
    s.setMode('draw'); fx.log.length = 0;
    s.cancel();
    expect(fx.calls).toEqual(['cancelShape']);
    expect(s.mode).toBe('move');
  });

  it('switching to or from a shape tool discards the preview and returns to move', () => {
    const { fx, s } = make('ellipse');
    s.setMode('draw'); fx.log.length = 0;
    s.setTool('pen');
    expect(fx.calls).toEqual(['cancelShape']);
    expect(s.mode).toBe('move');
    s.setMode('draw');
    s.setTool('line');
    expect(s.mode).toBe('move');
  });

  it('a tap in draw mode with a shape tool only moves the end corner', () => {
    const { fx, s } = make('line');
    s.setMode('draw'); fx.log.length = 0;
    tap(s, 45, 45, 0);
    expect(fx.calls.every(l => l.startsWith('preview'))).toBe(true);
    expect(s.mode).toBe('draw');
  });
});

describe('PrecisionSession: gesperrte Ebene', () => {
  it('no stroke, no fill, no shape when the layer is blocked; the picker still works', () => {
    const { fx, s } = make('pen');
    fx.isBlocked = true;
    s.setMode('draw'); fx.log.length = 0;
    tap(s, 35, 35, 0);
    expect(fx.calls).toEqual([]);
    s.setTool('fill');
    tap(s, 35, 35, 1000);
    expect(fx.calls).toEqual([]);
    s.setTool('line');
    s.setMode('move'); s.setMode('draw');
    expect(s.mode).toBe('move'); // Formen starten im gesperrten Zustand nicht
    expect(fx.calls.filter(l => l.startsWith('preview') || l === 'commit')).toEqual([]);
    s.setTool('picker'); s.setMode('draw'); fx.log.length = 0;
    tap(s, 35, 35, 2000);
    expect(fx.calls).toEqual(['pick:3,3']);
  });
});
