import { describe, it, expect } from 'vitest';
import { TapDetector, TAP_MAX_MS, DOUBLE_GAP_MS, DOUBLE_DIST_PX } from './tapDetector';

function tap(d: TapDetector, x: number, y: number, t0: number, dur = 80) {
  d.down(x, y, t0);
  return d.up(x, y, t0 + dur);
}

describe('TapDetector', () => {
  it('uses the spec thresholds', () => {
    expect([TAP_MAX_MS, DOUBLE_GAP_MS, DOUBLE_DIST_PX]).toEqual([300, 350, 50]);
  });

  it('reports a short touch as a tap', () => {
    expect(tap(new TapDetector(), 10, 10, 0)).toBe('tap');
  });

  it('reports two quick taps as tap then doubleTap', () => {
    const d = new TapDetector();
    expect(tap(d, 10, 10, 0)).toBe('tap');          // up bei 80
    expect(tap(d, 12, 11, 150)).toBe('doubleTap');   // up bei 230
  });

  it('allows exactly 350 ms between the releases, not 351', () => {
    let d = new TapDetector();
    tap(d, 0, 0, 0);                                 // up bei 80
    expect(tap(d, 0, 0, 350)).toBe('doubleTap');     // up bei 430
    d = new TapDetector();
    tap(d, 0, 0, 0);
    expect(tap(d, 0, 0, 351)).toBe('tap');           // up bei 431
  });

  it('requires the taps to be closer than 50 px', () => {
    let d = new TapDetector();
    tap(d, 0, 0, 0);
    expect(tap(d, 49, 0, 100)).toBe('doubleTap');
    d = new TapDetector();
    tap(d, 0, 0, 0);
    expect(tap(d, 50, 0, 100)).toBe('tap');
  });

  it('treats a touch of 300 ms or more as a drag', () => {
    expect(tap(new TapDetector(), 0, 0, 0, 299)).toBe('tap');
    expect(tap(new TapDetector(), 0, 0, 0, 300)).toBe('drag');
  });

  it('treats movement beyond the tap threshold as a drag', () => {
    let d = new TapDetector();
    d.down(0, 0, 0);
    expect(d.move(6, 0)).toBe(false);
    expect(d.up(6, 0, 50)).toBe('tap');
    d = new TapDetector();
    d.down(0, 0, 0);
    expect(d.move(7, 0)).toBe(true);
    expect(d.up(7, 0, 50)).toBe('drag');
  });

  it('a drag between two taps prevents the double tap', () => {
    const d = new TapDetector();
    tap(d, 0, 0, 0);
    d.down(0, 0, 100); d.move(40, 0); d.up(40, 0, 150);
    expect(tap(d, 0, 0, 200)).toBe('tap');
  });

  it('a third tap right after a double tap is a new first tap', () => {
    const d = new TapDetector();
    tap(d, 0, 0, 0);
    expect(tap(d, 0, 0, 100)).toBe('doubleTap');
    expect(tap(d, 0, 0, 200)).toBe('tap');
  });

  it('cancel() forgets the previous tap', () => {
    const d = new TapDetector();
    tap(d, 0, 0, 0);
    d.cancel();
    expect(tap(d, 0, 0, 100)).toBe('tap');
  });
});
