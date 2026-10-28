import { describe, it, expect } from 'vitest';
import type { Area, AreaHandle, AreaHost } from '@suite/shared';
import type { SavedState } from './storage/state';
import { mountKlexel } from './klexel';

describe('Bereichs-Vertrag', () => {
  it('ein Bereich erfüllt Area/AreaHandle/AreaHost', () => {
    const calls: string[] = [];
    let payload = { n: 0 };
    const fake: Area<{ n: number }> = {
      kind: 'klexel',
      title: 'Test',
      mount(_root, host): AreaHandle<{ n: number }> {
        return {
          open: p => { payload = p; },
          snapshot: () => payload,
          thumbnail: () => undefined,
          flush: () => host.onChange(),
          setActive: () => {},
          destroy: () => {},
        };
      },
    };
    const host: AreaHost = {
      onChange: () => calls.push('change'),
      requestNewProject: init => calls.push(`new ${init?.width}x${init?.height}`),
      isActive: () => true,
    };
    const h = fake.mount({} as HTMLElement, host);
    h.open({ n: 3 });
    h.flush();
    host.requestNewProject({ width: 8, height: 4 });
    expect(h.snapshot()).toEqual({ n: 3 });
    expect(calls).toEqual(['change', 'new 8x4']);
  });

  it('mountKlexel ist eine Einhängefunktion für Klexel-Payloads', () => {
    expect(typeof mountKlexel).toBe('function');
    const typed: (root: HTMLElement, host: AreaHost) => AreaHandle<SavedState> = mountKlexel;
    expect(typed).toBe(mountKlexel);
  });
});
