import { useEditor } from '../state/store';

/** The current-frame line. The only timeline part besides the ruler that follows `frame` during playback. */
export function Playhead({ cell }: { cell: number }) {
  const frame = useEditor((s) => s.frame);
  return <div className="tl-playhead" style={{ left: frame * cell + cell / 2 }} />;
}
