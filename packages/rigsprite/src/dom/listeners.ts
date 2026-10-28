type EventName = keyof GlobalEventHandlersEventMap;

/** One listener registration: target, event type, handler, options. */
export type ListenerEntry = {
  [K in EventName]: [target: EventTarget, type: K, fn: (e: GlobalEventHandlersEventMap[K]) => void, options?: AddEventListenerOptions];
}[EventName];

/**
 * Adds every listener of the table and returns one function that removes exactly these again,
 * so registration and removal cannot drift apart.
 */
export function addListeners(entries: ListenerEntry[]): () => void {
  for (const [target, type, fn, options] of entries) target.addEventListener(type, fn as EventListener, options);
  return () => {
    for (const [target, type, fn, options] of entries) target.removeEventListener(type, fn as EventListener, options);
  };
}
