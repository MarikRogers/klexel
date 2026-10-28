import { describe, expect, it, vi } from 'vitest';
import { shortcutsEnabled, watchProjectChanges } from './areaLogic';
import { createProject, type Project } from './core/project';
import type { Transaction } from './state/store';

interface S {
  project: Project;
  transaction: Transaction | null;
  frame: number;
}

/** Minimaler Store wie zustand: set ruft die Abonnenten mit (neu, alt). */
function fakeStore(init: S) {
  let state = init;
  const subs = new Set<(s: S, p: S) => void>();
  return {
    get: () => state,
    set(patch: Partial<S>) {
      const prev = state;
      state = { ...state, ...patch };
      for (const l of subs) l(state, prev);
    },
    subscribe(l: (s: S, p: S) => void) {
      subs.add(l);
      return () => void subs.delete(l);
    },
  };
}

describe('shortcutsEnabled', () => {
  it('nur aktiv und von der Hülle freigegeben', () => {
    expect(shortcutsEnabled(true, true)).toBe(true);
    expect(shortcutsEnabled(false, true)).toBe(false);
    expect(shortcutsEnabled(true, false)).toBe(false);
    expect(shortcutsEnabled(false, false)).toBe(false);
  });

  it('nicht, solange ein modaler Dialog (der Hülle) offen ist', () => {
    expect(shortcutsEnabled(true, true, false)).toBe(true);
    expect(shortcutsEnabled(true, true, true)).toBe(false);
  });
});

describe('watchProjectChanges', () => {
  const p0 = createProject('humanoid');
  const edit = (p: Project, name: string): Project => ({ ...p, name });

  it('meldet jede neue Projekt-Referenz genau einmal, Ansichts-Zustand nicht', () => {
    const store = fakeStore({ project: p0, transaction: null, frame: 0 });
    const onChange = vi.fn();
    watchProjectChanges(store, onChange);
    store.set({ frame: 3 });
    expect(onChange).not.toHaveBeenCalled();
    store.set({ project: edit(p0, 'a') });
    expect(onChange).toHaveBeenCalledTimes(1);
    store.set({ project: edit(p0, 'b'), frame: 1 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('Transaktion: nichts während des Ziehens, einmal beim Abschluss (wie commitTransaction)', () => {
    const store = fakeStore({ project: p0, transaction: null, frame: 0 });
    const onChange = vi.fn();
    watchProjectChanges(store, onChange);
    store.set({ transaction: { startProject: p0 } });
    store.set({ project: edit(p0, '1') });
    const end = edit(p0, '2');
    store.set({ project: end });
    expect(onChange).not.toHaveBeenCalled();
    // commitTransaction: zurückspulen (Transaktion noch offen), dann Endstand ohne Transaktion
    store.set({ project: p0 });
    store.set({ project: end, transaction: null });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('abgebrochene oder folgenlose Transaktion meldet nichts', () => {
    const store = fakeStore({ project: p0, transaction: null, frame: 0 });
    const onChange = vi.fn();
    watchProjectChanges(store, onChange);
    store.set({ transaction: { startProject: p0 } });
    store.set({ project: edit(p0, 'x') });
    store.set({ project: p0, transaction: null }); // cancelTransaction
    expect(onChange).not.toHaveBeenCalled();
  });

  it('abmelden', () => {
    const store = fakeStore({ project: p0, transaction: null, frame: 0 });
    const onChange = vi.fn();
    const stop = watchProjectChanges(store, onChange);
    stop();
    store.set({ project: edit(p0, 'z') });
    expect(onChange).not.toHaveBeenCalled();
  });
});
