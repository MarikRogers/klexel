// Planung der Rückgabe einer Animation an Klexel (rein, ohne DOM).

/** Spiegelt MAX_SIZE von Klexel (Kantenlänge in Pixeln). */
export const RETURN_MAX_SIZE = 128
/** Spiegelt MAX_FRAMES von Klexel. */
export const RETURN_MAX_FRAMES = 64

export interface ReturnOptions {
  /** Ganzzahliger Teiler >= 1 (1 = Originalgröße). */
  scale: number
  /** Frame-Bereich inklusiv, 0-basiert. */
  from: number
  to: number
}

export type ReturnReason = 'too-wide' | 'too-many-frames' | 'invalid'

export type ReturnPlan =
  | { ok: true; width: number; height: number; frames: number }
  | { ok: false; reasons: ReturnReason[]; suggestion: ReturnOptions }

const isPosInt = (n: number): boolean => Number.isInteger(n) && n >= 1

/** Kleinster Teiler, bei dem beide Kanten in die Grenze passen. */
function bestScale(w: number, h: number): number {
  return Math.max(1, Math.ceil(w / RETURN_MAX_SIZE), Math.ceil(h / RETURN_MAX_SIZE))
}

export function planReturn(
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  opts: ReturnOptions,
): ReturnPlan {
  const sizesValid = isPosInt(frameWidth) && isPosInt(frameHeight)
  const countValid = isPosInt(frameCount)
  const optsValid =
    !!opts &&
    isPosInt(opts.scale) &&
    Number.isInteger(opts.from) &&
    Number.isInteger(opts.to) &&
    opts.from >= 0 &&
    opts.to >= opts.from &&
    countValid &&
    opts.to < frameCount

  if (!sizesValid || !countValid || !optsValid) {
    const scale = sizesValid ? bestScale(frameWidth, frameHeight) : 1
    const last = countValid ? Math.min(frameCount, RETURN_MAX_FRAMES) - 1 : 0
    return { ok: false, reasons: ['invalid'], suggestion: { scale, from: 0, to: Math.max(0, last) } }
  }

  const width = Math.ceil(frameWidth / opts.scale)
  const height = Math.ceil(frameHeight / opts.scale)
  const frames = opts.to - opts.from + 1
  const tooWide = width > RETURN_MAX_SIZE || height > RETURN_MAX_SIZE
  const tooMany = frames > RETURN_MAX_FRAMES

  if (!tooWide && !tooMany) return { ok: true, width, height, frames }

  const reasons: ReturnReason[] = []
  if (tooWide) reasons.push('too-wide')
  if (tooMany) reasons.push('too-many-frames')
  const from = Math.min(opts.from, frameCount - 1)
  return {
    ok: false,
    reasons,
    suggestion: {
      scale: tooWide ? bestScale(frameWidth, frameHeight) : opts.scale,
      from: tooMany ? from : opts.from,
      to: tooMany ? Math.min(frameCount - 1, from + RETURN_MAX_FRAMES - 1) : opts.to,
    },
  }
}

/** Verkleinert per Nearest-Neighbor; je Block zählt das mittlere Pixel. */
export function downscaleNearest(pixels: Uint32Array, w: number, h: number, divisor: number): Uint32Array {
  if (!isPosInt(divisor)) throw new RangeError(`Ungültiger Teiler: ${divisor}`)
  if (!isPosInt(w) || !isPosInt(h) || pixels.length !== w * h) {
    throw new RangeError('Pixelanzahl passt nicht zu Breite × Höhe')
  }
  if (divisor === 1) return pixels.slice()
  const ow = Math.ceil(w / divisor)
  const oh = Math.ceil(h / divisor)
  const half = Math.floor(divisor / 2)
  const out = new Uint32Array(ow * oh)
  for (let oy = 0; oy < oh; oy++) {
    const sy = Math.min(h - 1, oy * divisor + half)
    for (let ox = 0; ox < ow; ox++) {
      const sx = Math.min(w - 1, ox * divisor + half)
      out[oy * ow + ox] = pixels[sy * w + sx]
    }
  }
  return out
}
