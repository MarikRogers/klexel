import { useEffect, useRef, useState } from 'react';
import type { Vec2 } from '../core/math';
import { WEBGL2_UNSUPPORTED } from '../core/messages';
import { addListeners } from '../dom/listeners';
import { createImageCache } from '../render/imageCache';
import { createLayerCache } from '../render/layers';
import { drawOverlay } from '../render/overlay';
import { SkinRenderer } from '../render/SkinRenderer';
import { followCameraPan, type CameraAngles } from '../render/view';
import { useEditor, type EditorState } from '../state/store';
import { OrbitControls } from './OrbitControls';
import { capturePointer } from './pointer';
import { createFrameCache } from './viewportFrame';
import { createViewportGestures, type GesturePointer } from './viewportGestures';
import { cssView, deviceView, zoomAt, type ViewportSize } from './viewportView';

/**
 * A camera angle change (roll, orbit or mirror: button, key, field, undo) turns the view around the
 * viewport centre: the world point under the centre stays put (see followCameraPan).
 */
function createCameraFollower(): (s: EditorState) => void {
  const angles = (s: EditorState): CameraAngles => ({
    rotation: s.project.settings.cameraRotation,
    yaw: s.orbit.yaw,
    pitch: s.orbit.pitch,
    mirror: s.project.settings.mirror,
  });
  let last = angles(useEditor.getState());
  return (s) => {
    const next = angles(s);
    if (
      next.rotation === last.rotation &&
      next.yaw === last.yaw &&
      next.pitch === last.pitch &&
      next.mirror === last.mirror
    ) {
      return;
    }
    const from = last;
    last = next;
    s.setView(followCameraPan(s.view, from, next));
  };
}

/** Sizes both canvases to the container in device pixels; returns the new viewport size. */
function fitCanvases(container: HTMLElement, canvases: HTMLCanvasElement[]): ViewportSize {
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  for (const c of canvases) {
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
  }
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr };
}

/** Event position in CSS pixels relative to `el`. */
function screenPoint(e: MouseEvent, el: Element): Vec2 {
  const rect = el.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function pointerInput(e: PointerEvent, el: Element): GesturePointer {
  return { pointerId: e.pointerId, button: e.button, pointerType: e.pointerType, shiftKey: e.shiftKey, p: screenPoint(e, el) };
}

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [glError, setGlError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const glCanvas = glCanvasRef.current!;
    const overlay = overlayRef.current!;
    let renderer: SkinRenderer;
    try {
      renderer = new SkinRenderer(glCanvas);
    } catch {
      setGlError(WEBGL2_UNSUPPORTED);
      return;
    }
    const ctx = overlay.getContext('2d')!;
    let size: ViewportSize = { width: 1, height: 1, dpr: 1 };
    let raf = 0;
    let disposed = false;
    const schedule = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(draw);
    };
    const view = (s: EditorState) => cssView(s, size);
    // Last built frame; view / selection changes only redraw it.
    const computeFrame = createFrameCache();
    // Draw order with depths; shared by rendering and picking, reordered only when needed.
    const layerCache = createLayerCache();
    const layers = (s: EditorState) => layerCache(computeFrame(s).items, view(s), s.layerSpacing);
    const images = createImageCache(renderer, schedule);
    const gestures = createViewportGestures({ view, frame: computeFrame, layers });
    const followCamera = createCameraFollower();

    function draw() {
      raf = 0;
      const s = useEditor.getState();
      images.sync(s.project.images, s.project.settings.pixelArt);
      const { world } = computeFrame(s);
      const v = view(s);
      // Depth offsets are in screen units of the view they are computed with: the device view scales them with zoom · dpr.
      const dv = deviceView(v, size.dpr, glCanvas.width, glCanvas.height);
      renderer.render(layers(s), dv, s.project.settings.background);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      if (s.showRig) drawOverlay(ctx, s.project.rig, world, v, s.selectedBoneId);
    }

    const resizeObserver = new ResizeObserver(() => {
      size = fitCanvases(container, [glCanvas, overlay]);
      schedule();
    });
    resizeObserver.observe(container);
    const unsubscribe = useEditor.subscribe((s) => {
      followCamera(s);
      schedule();
    });

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useEditor.getState();
      s.setView(zoomAt(view(s), screenPoint(e, overlay), e.deltaY));
    };
    const onPointerDown = (e: PointerEvent) => {
      const { tracked, preventDefault } = gestures.down(pointerInput(e, overlay));
      if (tracked) capturePointer(overlay, e.pointerId);
      if (preventDefault) e.preventDefault();
    };
    // pointercancel / lostpointercapture (capture taken away mid-drag) abort; only pointerup commits.
    const onPointerEnd = (e: PointerEvent) => gestures.end(e.pointerId, e.type === 'pointerup');
    const removeListeners = addListeners([
      [overlay, 'wheel', onWheel, { passive: false }],
      [overlay, 'pointerdown', onPointerDown],
      [window, 'pointermove', (e: PointerEvent) => gestures.move(pointerInput(e, overlay))],
      [window, 'pointerup', onPointerEnd],
      [window, 'pointercancel', onPointerEnd],
      [overlay, 'lostpointercapture', onPointerEnd],
      [window, 'blur', () => gestures.blur()],
    ]);

    return () => {
      gestures.dispose();
      disposed = true;
      images.dispose();
      if (raf) cancelAnimationFrame(raf);
      removeListeners();
      unsubscribe();
      resizeObserver.disconnect();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      // Right-button drag orbits the camera: no context menu in the viewport (the orbit panel keeps its own).
      onContextMenu={(e) => {
        if (!(e.target as Element).closest('.orbit-panel')) e.preventDefault();
      }}
    >
      <canvas ref={glCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <canvas
        ref={overlayRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
      />
      <OrbitControls />
      {glError && (
        <div role="alert" className="error" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16 }}>
          {glError}
        </div>
      )}
    </div>
  );
}
