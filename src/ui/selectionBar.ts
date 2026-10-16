import type { SelectionSession, LiftResult } from '../edit/SelectionSession';
import { ICON } from './icons';
import { showToast } from './toast';

type Mode = 'replace' | 'add' | 'subtract';

export interface SelectionBarDeps {
  getSession(): SelectionSession;
  getMode(): Mode;
  setMode(m: Mode): void;
  getPasteCenter(): [number, number];
  onChange(): void;
}

export interface SelectionBar {
  el: HTMLElement;
  setVisible(v: boolean): void;
  refresh(): void;
}

const MODES: Array<[Mode, string, string]> = [
  ['replace', 'Neu', 'Neue Auswahl'],
  ['add', '+', 'Zur Auswahl hinzufügen'],
  ['subtract', '−', 'Von der Auswahl abziehen'],
];

export function createSelectionBar(deps: SelectionBarDeps): SelectionBar {
  const el = document.createElement('div');
  el.id = 'selbar';
  el.hidden = true;
  const btn = (act: string, label: string, icon: string, extra = '') =>
    `<button data-act="${act}" title="${label}" aria-label="${label}"${extra}>${icon}</button>`;
  el.innerHTML = `
    <div class="selbar-group selbar-modes" role="group" aria-label="Auswahlmodus">
      ${MODES.map(([m, text, label]) =>
        `<button data-mode="${m}" title="${label}" aria-label="${label}">${text}</button>`).join('')}
    </div>
    <div class="selbar-group selbar-actions">
      ${btn('all', 'Alles auswählen', ICON.selAll)}
      ${btn('none', 'Auswahl aufheben', ICON.deselect)}
      ${btn('copy', 'Kopieren', ICON.copy)}
      ${btn('cut', 'Ausschneiden', ICON.cut)}
      ${btn('paste', 'Einfügen', ICON.paste)}
      ${btn('delete', 'Löschen', ICON.trash)}
      ${btn('flipH', 'Horizontal spiegeln', ICON.flipH)}
      ${btn('flipV', 'Vertikal spiegeln', ICON.flipV)}
      ${btn('rotate', 'Drehen', ICON.rotate)}
      ${btn('commit', 'Absetzen', `${ICON.check}<span>Absetzen</span>`, ' class="selbar-commit" hidden')}
    </div>`;

  const act = (name: string) => el.querySelector<HTMLButtonElement>(`[data-act=${name}]`)!;
  const modeBtns = [...el.querySelectorAll<HTMLButtonElement>('[data-mode]')];

  const warn = (r: LiftResult) => {
    if (r === 'locked') showToast('Ebene gesperrt');
    else if (r === 'hidden') showToast('Ebene ausgeblendet');
  };

  const actions: Record<string, (s: SelectionSession) => void> = {
    all: s => s.selectAll(),
    none: s => s.deselect(),
    copy: s => { s.copy(); },
    cut: s => warn(s.cut()),
    paste: s => warn(s.paste(...deps.getPasteCenter())),
    delete: s => warn(s.delete()),
    flipH: s => warn(s.flip('h')),
    flipV: s => warn(s.flip('v')),
    rotate: s => warn(s.rotate90()),
    commit: s => s.commit(),
  };

  el.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    const session = deps.getSession();
    if (b.dataset.mode) {
      session.commit();
      deps.setMode(b.dataset.mode as Mode);
    } else if (b.dataset.act) {
      actions[b.dataset.act](session);
    }
    deps.onChange();
  });

  function refresh(): void {
    const s = deps.getSession();
    const mode = deps.getMode();
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    for (const name of ['none', 'copy', 'cut', 'delete', 'flipH', 'flipV', 'rotate']) {
      act(name).disabled = !s.hasSelection;
    }
    act('paste').disabled = !s.clip;
    act('commit').hidden = !s.isFloating;
  }

  document.getElementById('app')!.insertBefore(el, document.getElementById('bottom'));
  refresh();
  return { el, setVisible(v) { el.hidden = !v; }, refresh };
}
