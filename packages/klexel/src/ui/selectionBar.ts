import type { SelectionSession, LiftResult } from '../edit/SelectionSession';
import { ICON } from './icons';
import { showToast } from './toast';
import { SELECTION_SHORTCUT_LABEL, type SelectionShortcut } from './shortcuts';

type Mode = 'replace' | 'add' | 'subtract';
type Shape = 'rect' | 'lasso' | 'wand';

export interface SelectionBarDeps {
  getSession(): SelectionSession;
  getMode(): Mode;
  setMode(m: Mode): void;
  getShape(): Shape;
  setShape(s: Shape): void;
  getWandAll(): boolean;
  setWandAll(on: boolean): void;
  getPasteCenter(): [number, number];
  onChange(): void;
}

export interface SelectionBar {
  el: HTMLElement;
  setVisible(v: boolean): void;
  refresh(): void;
}

const SHAPES: Array<[Shape, string, string]> = [
  ['rect', ICON.select, 'Rechteck'],
  ['lasso', ICON.lasso, 'Lasso'],
  ['wand', ICON.wand, 'Zauberstab'],
];

const MODES: Array<[Mode, string, string]> = [
  ['replace', 'Neu', 'Neue Auswahl'],
  ['add', '+', 'Zur Auswahl hinzufügen'],
  ['subtract', '−', 'Von der Auswahl abziehen'],
];

export function createSelectionBar(deps: SelectionBarDeps): SelectionBar {
  const el = document.createElement('div');
  el.id = 'selbar';
  el.hidden = true;
  const btn = (act: string, label: string, icon: string, extra = '') => {
    const key = SELECTION_SHORTCUT_LABEL[act as SelectionShortcut];
    const title = key ? `${label} (${key})` : label;
    return `<button data-act="${act}" title="${title}" aria-label="${label}"${extra}>${icon}</button>`;
  };
  el.innerHTML = `
    <div class="selbar-row">
    <div class="selbar-group selbar-shapes" role="group" aria-label="Auswahlform">
      ${SHAPES.map(([sh, icon, label]) =>
        `<button data-shape="${sh}" title="${label}" aria-label="${label}">${icon}</button>`).join('')}
    </div>
    <div class="selbar-group selbar-modes" role="group" aria-label="Auswahlmodus">
      ${MODES.map(([m, text, label]) =>
        `<button data-mode="${m}" title="${label}" aria-label="${label}">${text}</button>`).join('')}
    </div>
    <button data-wandall title="Alle Farben" aria-label="Alle Farben" class="selbar-wandall" hidden>Alle<br>Farben</button>
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
  const shapeBtns = [...el.querySelectorAll<HTMLButtonElement>('[data-shape]')];
  const shapeGroup = el.querySelector<HTMLElement>('.selbar-shapes')!;
  const wandAllBtn = el.querySelector<HTMLButtonElement>('[data-wandall]')!;
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
    if (b.dataset.shape) {
      session.commit();
      deps.setShape(b.dataset.shape as Shape);
    } else if (b.hasAttribute('data-wandall')) {
      session.commit();
      deps.setWandAll(!deps.getWandAll());
    } else if (b.dataset.mode) {
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
    const shape = deps.getShape();
    shapeBtns.forEach(b => {
      const on = b.dataset.shape === shape;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    // Während des Schwebens wird nichts ausgewählt: Form und Schalter ausblenden (Platz im Hochformat)
    shapeGroup.hidden = s.isFloating;
    wandAllBtn.hidden = shape !== 'wand' || s.isFloating;
    wandAllBtn.classList.toggle('active', deps.getWandAll());
    wandAllBtn.setAttribute('aria-pressed', String(deps.getWandAll()));
    modeBtns.forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    for (const name of ['none', 'copy', 'cut', 'delete', 'flipH', 'flipV', 'rotate']) {
      act(name).disabled = !s.hasSelection;
    }
    act('paste').disabled = !s.clip;
    const commit = act('commit');
    const wasHidden = commit.hidden;
    commit.hidden = !s.isFloating;
    // Hochformat: die Aktionszeile scrollt; ✓ soll beim Erscheinen sichtbar sein
    if (wasHidden && !commit.hidden) commit.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  document.getElementById('app')!.insertBefore(el, document.getElementById('bottom'));
  refresh();
  return { el, setVisible(v) { el.hidden = !v; }, refresh };
}
