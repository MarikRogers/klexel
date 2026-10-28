import { useEffect, useRef } from 'react';
import { clamp } from '../core/math';
import { editor, selectActiveAnimation, useEditor } from '../state/store';
import { NAME_COLUMN_WIDTH } from './constants';
import { Playhead } from './Playhead';
import { capturePointer } from './pointer';

interface RulerProps {
  length: number;
  cell: number;
  /** Width of the cell area in px. */
  width: number;
}


/** Frame numbers; click or drag over it to scrub. */
export function Ruler({ length, cell, width }: RulerProps) {
  const frame = useEditor((s) => s.frame);
  const animationId = useEditor((s) => s.animationId);
  const scrubRef = useRef<number | null>(null);
  // Another animation: drop a running scrub.
  useEffect(() => {
    return () => {
      scrubRef.current = null;
    };
  }, [animationId]);

  const scrubTo = (e: React.PointerEvent<HTMLElement>) => {
    const s = editor();
    const max = selectActiveAnimation(s)?.length ?? 1;
    const rect = e.currentTarget.getBoundingClientRect();
    s.setFrame(clamp(Math.floor((e.clientX - rect.left) / cell), 0, max - 1));
  };

  return (
    <div className="tl-row tl-ruler" style={{ width: NAME_COLUMN_WIDTH + width }}>
      <div className="tl-name" />
      <div
        className="tl-cells"
        data-testid="ruler"
        style={{ width }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          capturePointer(e.currentTarget, e.pointerId);
          scrubRef.current = e.pointerId;
          scrubTo(e);
        }}
        onPointerMove={(e) => {
          if (scrubRef.current === e.pointerId) scrubTo(e);
        }}
        onPointerUp={() => (scrubRef.current = null)}
        onPointerCancel={() => (scrubRef.current = null)}
      >
        {Array.from({ length }, (_, i) => (
          <div
            key={i}
            data-testid={`frame-${i}`}
            className={i === frame ? 'tl-frame current' : 'tl-frame'}
            style={{ left: i * cell, width: cell }}
            onClick={() => editor().setFrame(i)}
          >
            {i % 5 === 0 ? i : ''}
          </div>
        ))}
        <Playhead cell={cell} />
      </div>
    </div>
  );
}
