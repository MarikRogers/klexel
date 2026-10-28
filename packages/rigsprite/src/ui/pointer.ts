/** Pointer capture keeps a drag on its element; it can throw for pointers that are already gone. */
export function capturePointer(el: Element, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // ignore: the pointer is gone (synthetic event); window listeners still see the rest of the gesture
  }
}
