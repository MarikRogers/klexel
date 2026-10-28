/**
 * Hook for a still image of the viewport (used by the suite for project thumbnails). The mounted Viewport
 * registers a function that draws the current frame synchronously and returns its canvases (bottom first).
 */
export type ViewportCapture = () => HTMLCanvasElement[] | null;

let current: ViewportCapture | null = null;

/** Registers `fn` as the viewport capture; returns a function that removes it again (if still registered). */
export function registerViewportCapture(fn: ViewportCapture): () => void {
  current = fn;
  return () => {
    if (current === fn) current = null;
  };
}

/** Canvases of the freshly drawn viewport, or null when no viewport is mounted. */
export function captureViewport(): HTMLCanvasElement[] | null {
  return current ? current() : null;
}
