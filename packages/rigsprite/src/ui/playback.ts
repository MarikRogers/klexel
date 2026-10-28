import { selectActiveAnimation, useEditor } from '../state/store';

export function advanceFrame(frame: number, length: number, loop: boolean): { frame: number; playing: boolean } {
  if (frame + 1 < length) return { frame: frame + 1, playing: true };
  return loop ? { frame: 0, playing: true } : { frame: Math.max(length - 1, 0), playing: false };
}

/** Runs the playback clock: one frame per 1000/fps ms. Returns a function that stops it. */
export function startPlayback(): () => void {
  let raf = 0;
  let last = 0;
  let acc = 0;
  const tick = (now: number) => {
    const s = useEditor.getState();
    const anim = selectActiveAnimation(s);
    if (!s.playing || !anim) {
      s.setPlaying(false);
      return;
    }
    const elapsed = last ? now - last : 0;
    // After a long gap (hidden tab) advance at most one frame instead of jumping.
    acc += elapsed > 250 ? 1000 / Math.max(anim.fps, 1) : elapsed;
    last = now;
    const step = 1000 / Math.max(anim.fps, 1);
    let frame = s.frame;
    while (acc >= step) {
      acc -= step;
      const next = advanceFrame(frame, anim.length, anim.loop);
      frame = next.frame;
      if (!next.playing) {
        s.setFrame(frame);
        s.setPlaying(false);
        return;
      }
    }
    if (frame !== s.frame) s.setFrame(frame);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
