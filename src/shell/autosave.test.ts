import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosave } from './autosave';

function deferred() {
  let resolve!: () => void, reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createAutosave', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('mehrfaches schedule ergibt einen Schreibvorgang nach delayMs', async () => {
    const save = vi.fn(async () => {});
    const a = createAutosave({ save, delayMs: 300 });
    a.schedule(); a.schedule();
    await vi.advanceTimersByTimeAsync(200);
    a.schedule();
    await vi.advanceTimersByTimeAsync(299);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.pending()).toBe(false);
  });

  it('flush schreibt sofort', async () => {
    const save = vi.fn(async () => {});
    const a = createAutosave({ save, delayMs: 300 });
    a.schedule();
    await a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush ohne Änderung schreibt nicht', async () => {
    const save = vi.fn(async () => {});
    const a = createAutosave({ save });
    await a.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it('flush wartet auf einen laufenden Schreibvorgang und schreibt nie parallel', async () => {
    const d1 = deferred();
    let running = 0, maxRunning = 0;
    const save = vi.fn(async () => {
      running++; maxRunning = Math.max(maxRunning, running);
      if (save.mock.calls.length === 1) await d1.promise;
      running--;
    });
    const a = createAutosave({ save, delayMs: 100 });
    a.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1); // läuft noch
    a.schedule(); // Änderung während des Schreibens
    let done = false;
    const f = a.flush().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    d1.resolve();
    await f;
    expect(save).toHaveBeenCalledTimes(2);
    expect(maxRunning).toBe(1);
  });

  it('flush wartet auch ohne neue Änderung auf den laufenden Schreibvorgang', async () => {
    const d1 = deferred();
    const save = vi.fn(() => d1.promise);
    const a = createAutosave({ save, delayMs: 100 });
    a.schedule();
    await vi.advanceTimersByTimeAsync(100);
    let done = false;
    const f = a.flush().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    d1.resolve();
    await f;
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('Fehler wird gemeldet, das nächste schedule versucht erneut', async () => {
    const onError = vi.fn();
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('voll'))
      .mockResolvedValue(undefined);
    const a = createAutosave({ save, delayMs: 100, onError });
    a.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('voll');
    expect(a.pending()).toBe(true); // ungesichert
    a.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.pending()).toBe(false);
  });

  it('flush lehnt ab, wenn der Schreibvorgang scheitert', async () => {
    const onError = vi.fn();
    const save = vi.fn().mockRejectedValue(new Error('kaputt'));
    const a = createAutosave({ save, onError });
    a.schedule();
    await expect(a.flush()).rejects.toThrow('kaputt');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('cancel verwirft eine geplante Speicherung', async () => {
    const save = vi.fn(async () => {});
    const a = createAutosave({ save, delayMs: 100 });
    a.schedule();
    a.cancel();
    await vi.advanceTimersByTimeAsync(500);
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    expect(a.pending()).toBe(false);
  });
});
