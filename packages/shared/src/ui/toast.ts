import './toast.css';

let el: HTMLDivElement | null = null;
let timer = 0;

/** Modaler Dialog (Top Layer)? Ohne :modal-Unterstützung: unbekannt (false). */
function isModal(d: HTMLDialogElement): boolean {
  try { return d.matches(':modal'); } catch { return false; }
}

/**
 * Wohin die Meldung gehört: in den zuletzt geöffneten modalen Dialog, sonst in <body>. Ein modaler Dialog liegt im
 * Top Layer über allem anderen (z-index hilft dort nicht), und der Rest der Seite ist dann inert; in ihm bleibt die
 * Meldung sichtbar und wird vorgelesen. position:fixed gilt im Dialog weiter relativ zum Fenster.
 */
function toastParent(): HTMLElement {
  // Modale zuerst; sonst (z. B. ohne :modal-Unterstützung) der zuletzt im Dokument stehende offene Dialog
  const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')];
  return open.filter(isModal).at(-1) ?? open.at(-1) ?? document.body;
}

/** Zeigt eine kurze Meldung unten mittig; eine laufende Meldung wird ersetzt (Hülle und Bereiche teilen sich die Anzeige). */
export function showToast(message: string, ms = 1500): void {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
  }
  const parent = toastParent();
  if (el.parentElement !== parent) parent.appendChild(el);
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove('show'), ms);
}
