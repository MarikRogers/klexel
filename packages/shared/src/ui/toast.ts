import './toast.css';

let el: HTMLDivElement | null = null;
let timer = 0;

/** Zeigt eine kurze Meldung unten mittig; eine laufende Meldung wird ersetzt (Hülle und Bereiche teilen sich die Anzeige). */
export function showToast(message: string, ms = 1500): void {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove('show'), ms);
}
