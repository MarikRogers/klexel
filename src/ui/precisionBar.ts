import type { PrecisionSettings } from '../precision/settings';
import type { Mode } from '../precision/PrecisionSession';

export interface PrecisionBarDeps {
  getSettings(): PrecisionSettings;
  update(patch: Partial<PrecisionSettings>): void;
  getTool(): string;
  /** Präzisionscursor eingeschaltet und beim aktuellen Werkzeug wirksam */
  isActive(): boolean;
  getMode(): Mode;
  setMode(m: Mode): void;
}

export interface PrecisionBar {
  el: HTMLElement;
  refresh(): void;
}

/** Leiste über den Werkzeugen: Modus Bewegen/Zeichnen, Händigkeit, Pixel-perfect (je nach Werkzeug sichtbar). */
export function createPrecisionBar(deps: PrecisionBarDeps): PrecisionBar {
  const el = document.createElement('div');
  el.id = 'precbar';
  el.hidden = true;
  el.innerHTML = `
    <button data-mode title="Zwischen Bewegen und Zeichnen umschalten" aria-label="Modus"></button>
    <button data-hand title="Händigkeit" aria-label="Händigkeit"></button>
    <button data-pp title="Pixel-perfect-Strich" aria-label="Pixel-perfect-Strich">Pixel-perfect</button>`;
  const modeBtn = el.querySelector<HTMLButtonElement>('[data-mode]')!;
  const handBtn = el.querySelector<HTMLButtonElement>('[data-hand]')!;
  const pp = el.querySelector<HTMLButtonElement>('[data-pp]')!;

  modeBtn.addEventListener('click', () => { deps.setMode(deps.getMode() === 'draw' ? 'move' : 'draw'); refresh(); });
  handBtn.addEventListener('click', () => {
    deps.update({ hand: deps.getSettings().hand === 'R' ? 'L' : 'R' });
    refresh();
  });
  pp.addEventListener('click', () => {
    deps.update({ pixelPerfect: !deps.getSettings().pixelPerfect });
    refresh();
  });

  function refresh(): void {
    const s = deps.getSettings();
    const tool = deps.getTool();
    const mode = deps.getMode();
    modeBtn.hidden = !deps.isActive();
    modeBtn.textContent = mode === 'draw' ? 'Zeichnen' : 'Bewegen';
    modeBtn.classList.toggle('active', mode === 'draw');
    modeBtn.setAttribute('aria-pressed', String(mode === 'draw'));
    handBtn.hidden = !s.on;
    handBtn.textContent = s.hand === 'R' ? 'Hand: rechts' : 'Hand: links';
    pp.hidden = !(tool === 'pen' || tool === 'eraser');
    pp.classList.toggle('active', s.pixelPerfect);
    pp.setAttribute('aria-pressed', String(s.pixelPerfect));
    el.hidden = [...el.children].every(c => (c as HTMLElement).hidden);
  }

  document.getElementById('app')!.insertBefore(el, document.getElementById('bottom'));
  refresh();
  return { el, refresh };
}
