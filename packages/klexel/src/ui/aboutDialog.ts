import { LINKS } from '../config';
import { linkAction } from './aboutLinks';

const NOTES = {
  placeholder: 'Dieser Link folgt in Kürze.',
  offline: 'Keine Internetverbindung. Bitte später erneut versuchen.',
} as const;

/** Dialog "Über Klexel": Name, Version, Unterstützen, Feedback, Datenschutz/Impressum. */
export function createAboutDialog(): { open(): void } {
  const dlg = document.createElement('dialog');
  dlg.id = 'aboutDlg';
  dlg.setAttribute('aria-label', 'Über Klexel');
  dlg.innerHTML = `
    <div class="about">
      <div class="about-head">
        <img src="./icon-192.png" alt="" width="96" height="96" />
        <h2>Klexel</h2>
        <p class="about-sub">Pixelart-Editor fürs Handy</p>
        <p class="about-text">Ebenen, Animation und Auswahl. Offline nutzbar, ohne Konto und ohne Tracking – deine Bilder bleiben auf deinem Gerät.</p>
        <p class="about-text">Klexel ist kostenlos. Wenn es dir gefällt, kannst du die Entwicklung freiwillig unterstützen.</p>
      </div>
      <div class="about-actions">
        <div class="about-links"></div>
        <p class="about-note" role="status" aria-live="polite"></p>
        <form method="dialog"><button class="about-close">Schließen</button></form>
      </div>
      <p class="about-version">Version ${__APP_VERSION__}</p>
    </div>`;
  document.getElementById('app')!.appendChild(dlg);

  const links = dlg.querySelector<HTMLElement>('.about-links')!;
  const note = dlg.querySelector<HTMLElement>('.about-note')!;

  const entries: Array<{ key: keyof typeof LINKS; label: string; primary?: boolean }> = [
    { key: 'support', label: '♥ Klexel unterstützen', primary: true },
    { key: 'feedback', label: 'Feedback / Fehler melden' },
    { key: 'privacy', label: 'Datenschutz' },
    { key: 'imprint', label: 'Impressum' },
  ];

  for (const { key, label, primary } of entries) {
    const url = LINKS[key];
    const real = linkAction(url, true) !== 'placeholder';
    const el: HTMLAnchorElement | HTMLButtonElement = real ? document.createElement('a') : document.createElement('button');
    el.className = 'about-link' + (primary ? ' primary' : '');
    if (primary) el.autofocus = true; // Fokus beim Öffnen auf die erste Aktion statt auf den Scrollbereich
    el.textContent = label;
    if (el instanceof HTMLAnchorElement) {
      el.href = url.trim();
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    } else {
      el.type = 'button';
    }
    el.addEventListener('click', e => {
      const action = linkAction(url, navigator.onLine);
      if (action === 'open') { note.textContent = ''; return; }
      e.preventDefault();
      note.textContent = NOTES[action];
    });
    links.appendChild(el);
  }

  // Klick auf den abgedunkelten Hintergrund schließt den Dialog
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  return {
    open() {
      note.textContent = '';
      if (!dlg.open) dlg.showModal();
    },
  };
}
