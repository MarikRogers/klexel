import { describe, it, expect, vi } from 'vitest';
import { createLinkGate } from './linkGate';

function setup(active: boolean) {
  const state = { active };
  const open = vi.fn();
  const gate = createLinkGate(() => state.active, open);
  return { state, open, gate };
}

describe('createLinkGate', () => {
  it('hashchange im inaktiven Bereich öffnet keinen Dialog, auch nicht später beim Aktivieren', () => {
    const { state, open, gate } = setup(false);
    gate.hashChanged();
    expect(open).not.toHaveBeenCalled();
    state.active = true;
    gate.activated();
    expect(open).not.toHaveBeenCalled(); // die Hülle ruft dafür follow()
  });

  it('hashchange im aktiven Bereich öffnet genau einmal', () => {
    const { open, gate } = setup(true);
    gate.hashChanged();
    gate.activated();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('Einhängen aktiv (Start): sofort, genau einmal', () => {
    const { open, gate } = setup(true);
    gate.mounted();
    gate.activated();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('Einhängen während eines Wechsels (inaktiv): erst beim Aktivieren, genau einmal', () => {
    const { state, open, gate } = setup(false);
    gate.mounted();
    expect(open).not.toHaveBeenCalled();
    gate.activated(); // Wechsel gescheitert: setActive(true), aber Bereich nicht der aktuelle
    expect(open).not.toHaveBeenCalled();
    state.active = true;
    gate.activated();
    gate.activated();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('follow: aktiv sofort; inaktiv vorgemerkt bis zum Aktivieren', () => {
    const a = setup(true);
    a.gate.follow();
    expect(a.open).toHaveBeenCalledTimes(1);
    const b = setup(false);
    b.gate.follow();
    expect(b.open).not.toHaveBeenCalled();
    b.state.active = true;
    b.gate.activated();
    expect(b.open).toHaveBeenCalledTimes(1);
  });
});
