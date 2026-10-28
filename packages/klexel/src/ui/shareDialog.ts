import { createShareLink, type ShareResult } from '../share/link';
import type { DecodedImage } from '../share/linkCodec';
import { drawDecoded } from './drawDecoded';
import { showToast } from './toast';

const WARN_TEXT = 'Der Link ist lang und kommt in manchen Messengern möglicherweise nicht vollständig an.';

function reasonText(r: Extract<ShareResult, { ok: false }>): string {
  switch (r.reason) {
    case 'too-long': return 'Der Link wäre zu lang.';
    case 'too-many-colors': return `Das Bild hat mehr als 32 Farben (${r.colors ?? '?'}).`;
    case 'too-large': return 'Das Bild ist größer als 64×64.';
    default: return 'Das Bild ist leer.';
  }
}

/** Dialog "Link teilen": Vorschau, Linklänge, Teilen/Kopieren. */
export function createShareDialog(deps: { getImage(): DecodedImage }): { open(): Promise<void> } {
  const dlg = document.createElement('dialog');
  dlg.id = 'shareDlg';
  dlg.setAttribute('aria-label', 'Link teilen');
  dlg.innerHTML = `
    <div class="sh">
      <h2>Link teilen</h2>
      <canvas class="sh-preview" width="1" height="1"></canvas>
      <p class="sh-info" role="status"></p>
      <p class="sh-status"></p>
      <input class="sh-url" type="text" readonly hidden aria-label="Link" />
      <div class="sh-actions">
        <button type="button" class="sh-share" hidden>Link teilen</button>
        <button type="button" class="sh-copy" hidden>Link kopieren</button>
        <button type="button" class="sh-close">Schließen</button>
      </div>
    </div>`;
  document.getElementById('app')!.appendChild(dlg);

  const q = <T extends Element>(sel: string) => dlg.querySelector<T>(sel)!;
  const preview = q<HTMLCanvasElement>('.sh-preview');
  const info = q<HTMLElement>('.sh-info');
  const status = q<HTMLElement>('.sh-status');
  const urlField = q<HTMLInputElement>('.sh-url');
  const shareBtn = q<HTMLButtonElement>('.sh-share');
  const copyBtn = q<HTMLButtonElement>('.sh-copy');
  let url = '';

  shareBtn.onclick = async () => {
    try { await navigator.share({ url }); } catch { /* abgebrochen */ }
  };
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link kopiert');
    } catch {
      status.textContent = 'Kopieren nicht möglich. Markiere den Link unten und kopiere ihn von Hand.';
      urlField.hidden = false;
      urlField.select();
    }
  };
  q<HTMLButtonElement>('.sh-close').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  return {
    async open() {
      const image = deps.getImage();
      drawDecoded(preview, image);
      const base = new URL('./', location.href);
      base.hash = ''; base.search = '';
      const r = await createShareLink(image, base.toString());
      urlField.hidden = true;
      shareBtn.hidden = copyBtn.hidden = true;
      if (r.ok) {
        url = r.url;
        urlField.value = url;
        info.textContent = `Länge: ${r.length} Zeichen`;
        status.textContent = r.level === 'warn' ? WARN_TEXT : 'Link bereit.';
        copyBtn.hidden = false;
        shareBtn.hidden = typeof navigator.share !== 'function';
      } else {
        url = '';
        info.textContent = r.length ? `Länge: ${r.length} Zeichen` : '';
        status.textContent = `${reasonText(r)} Speichere das Bild stattdessen als PNG (Button ⤓).`;
      }
      if (!dlg.open) dlg.showModal();
    },
  };
}
