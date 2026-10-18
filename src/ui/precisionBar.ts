import type { PrecisionSettings } from '../precision/settings';

export interface PrecisionBarDeps {
  getSettings(): PrecisionSettings;
  update(patch: Partial<PrecisionSettings>): void;
  getTool(): string;
}

export interface PrecisionBar {
  el: HTMLElement;
  refresh(): void;
}

/** Leiste über den Werkzeugen: Schalter für den Pixel-perfect-Strich (nur bei Stift und Radierer). */
export function createPrecisionBar(deps: PrecisionBarDeps): PrecisionBar {
  const el = document.createElement('div');
  el.id = 'precbar';
  el.hidden = true;
  el.innerHTML = `<button data-pp title="Pixel-perfect-Strich" aria-label="Pixel-perfect-Strich">Pixel-perfect</button>`;
  const pp = el.querySelector<HTMLButtonElement>('[data-pp]')!;

  pp.addEventListener('click', () => {
    deps.update({ pixelPerfect: !deps.getSettings().pixelPerfect });
    refresh();
  });

  function refresh(): void {
    const tool = deps.getTool();
    const on = deps.getSettings().pixelPerfect;
    pp.hidden = !(tool === 'pen' || tool === 'eraser');
    pp.classList.toggle('active', on);
    pp.setAttribute('aria-pressed', String(on));
    el.hidden = [...el.children].every(c => (c as HTMLElement).hidden);
  }

  document.getElementById('app')!.insertBefore(el, document.getElementById('bottom'));
  refresh();
  return { el, refresh };
}
