import { describe, expect, it } from 'vitest'
import { downscaleNearest, planReturn, RETURN_MAX_FRAMES, RETURN_MAX_SIZE } from './returnPlan'

const opt = (scale: number, from: number, to: number) => ({ scale, from, to })

describe('planReturn', () => {
  it('Grenzen spiegeln Klexel', () => {
    expect(RETURN_MAX_SIZE).toBe(128)
    expect(RETURN_MAX_FRAMES).toBe(64)
  })

  it('passt: 100x100, 10 Frames', () => {
    expect(planReturn(100, 100, 10, opt(1, 0, 9))).toEqual({ ok: true, width: 100, height: 100, frames: 10 })
  })

  it('zu breit: 200x100 -> Teiler 2', () => {
    const r = planReturn(200, 100, 10, opt(1, 0, 9))
    expect(r).toEqual({ ok: false, reasons: ['too-wide'], suggestion: opt(2, 0, 9) })
  })

  it('Grenze 128x128 passt, 129x128 nicht', () => {
    expect(planReturn(128, 128, 1, opt(1, 0, 0)).ok).toBe(true)
    const r = planReturn(129, 128, 1, opt(1, 0, 0))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reasons).toEqual(['too-wide'])
      expect(r.suggestion.scale).toBe(2)
    }
  })

  it('zu hoch', () => {
    const r = planReturn(100, 300, 1, opt(1, 0, 0))
    expect(r).toEqual({ ok: false, reasons: ['too-wide'], suggestion: opt(3, 0, 0) })
  })

  it('zu viele Frames: Bereich ab from, 64 Frames', () => {
    const r = planReturn(50, 50, 70, opt(1, 0, 69))
    expect(r).toEqual({ ok: false, reasons: ['too-many-frames'], suggestion: opt(1, 0, 63) })
  })

  it('zu viele Frames behält from', () => {
    const r = planReturn(50, 50, 100, opt(1, 10, 99))
    expect(r).toEqual({ ok: false, reasons: ['too-many-frames'], suggestion: opt(1, 10, 73) })
  })

  it('Bereich 5..68 (64 Frames) passt', () => {
    expect(planReturn(50, 50, 70, opt(1, 5, 68))).toEqual({ ok: true, width: 50, height: 50, frames: 64 })
  })

  it('beide Probleme', () => {
    const r = planReturn(300, 100, 70, opt(1, 0, 69))
    expect(r).toEqual({ ok: false, reasons: ['too-wide', 'too-many-frames'], suggestion: opt(3, 0, 63) })
  })

  it('Teiler mit Rest rundet auf', () => {
    expect(planReturn(150, 100, 1, opt(4, 0, 0))).toEqual({ ok: true, width: 38, height: 25, frames: 1 })
  })

  it('Vorschlag behält passenden Teiler', () => {
    const r = planReturn(400, 100, 70, opt(4, 0, 69))
    expect(r).toEqual({ ok: false, reasons: ['too-many-frames'], suggestion: opt(4, 0, 63) })
  })

  it('ungültige Eingaben: invalid, kein Wurf', () => {
    const cases: Array<[number, number, number, ReturnType<typeof opt>]> = [
      [100, 100, 10, opt(0, 0, 9)],
      [100, 100, 10, opt(1.5, 0, 9)],
      [100, 100, 10, opt(1, 5, 2)],
      [100, 100, 10, opt(1, -1, 2)],
      [100, 100, 10, opt(1, 0, 10)],
      [100, 100, 10, opt(NaN, 0, 9)],
      [NaN, 100, 10, opt(1, 0, 9)],
      [100, 0, 10, opt(1, 0, 9)],
      [100, 100, 0, opt(1, 0, 0)],
      [100, 100, Infinity, opt(1, 0, 9)],
    ]
    for (const [w, h, n, o] of cases) {
      const r = planReturn(w, h, n, o)
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.reasons).toContain('invalid')
        expect(r.suggestion.scale).toBeGreaterThanOrEqual(1)
        expect(r.suggestion.from).toBeGreaterThanOrEqual(0)
        expect(r.suggestion.to).toBeGreaterThanOrEqual(r.suggestion.from)
      }
    }
  })

  it('invalid mit gültigen Größen: Vollbereich-Bestfit', () => {
    const r = planReturn(300, 100, 100, opt(0, 0, 9))
    expect(r).toEqual({ ok: false, reasons: ['invalid'], suggestion: opt(3, 0, 63) })
  })

  it('Vorschlag besteht planReturn', () => {
    for (const w of [1, 64, 128, 129, 255, 256, 257, 1000]) {
      for (const h of [1, 100, 128, 129, 600]) {
        for (const n of [1, 10, 64, 65, 200]) {
          const r = planReturn(w, h, n, opt(1, 0, n - 1))
          if (r.ok) continue
          const again = planReturn(w, h, n, r.suggestion)
          expect(again.ok).toBe(true)
          if (again.ok) {
            expect(again.width).toBeLessThanOrEqual(128)
            expect(again.height).toBeLessThanOrEqual(128)
            expect(again.frames).toBeLessThanOrEqual(64)
          }
        }
      }
    }
  })
})

describe('downscaleNearest', () => {
  it('4x4 -> 2x2 mittleres Pixel je Block', () => {
    const px = Uint32Array.from({ length: 16 }, (_, i) => i)
    // Block (0,0): center x=1,y=1 -> 5; (1,0): x=3,y=1 -> 7; (0,1): 13; (1,1): 15
    expect(Array.from(downscaleNearest(px, 4, 4, 2))).toEqual([5, 7, 13, 15])
  })

  it('ragged 5x3, Teiler 2 -> 3x2', () => {
    const px = Uint32Array.from({ length: 15 }, (_, i) => i)
    // ox0: x=1; ox1: x=3; ox2: x0=4 -> min(4,5)=4; oy0: y=1; oy1: y0=2 -> min(2,3)=2
    expect(Array.from(downscaleNearest(px, 5, 3, 2))).toEqual([6, 8, 9, 11, 13, 14])
  })

  it('Teiler 1 liefert Kopie', () => {
    const px = Uint32Array.from([1, 2, 3, 4])
    const out = downscaleNearest(px, 2, 2, 1)
    expect(out).not.toBe(px)
    expect(Array.from(out)).toEqual([1, 2, 3, 4])
  })

  it('RangeError', () => {
    const px = new Uint32Array(4)
    expect(() => downscaleNearest(px, 2, 2, 0)).toThrow(RangeError)
    expect(() => downscaleNearest(px, 2, 2, 1.5)).toThrow(RangeError)
    expect(() => downscaleNearest(px, 2, 2, NaN)).toThrow(RangeError)
    expect(() => downscaleNearest(px, 3, 2, 1)).toThrow(RangeError)
  })
})
