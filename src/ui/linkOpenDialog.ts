import { PixelDocument } from '../model/Document';
import type { DecodedImage } from '../share/linkCodec';
import { docHasContent } from '../photo/hasContent';
import { exportPng } from '../storage/storage';
import { saveBlob } from '../export/saveBlob';
import { drawDecoded } from './drawDecoded';
import { showToast } from './toast';

export interface LinkOpenDeps {
  getDoc(): PixelDocument;
  onApply(doc: PixelDocument): void;
  /** Wird bei jedem Schließen des Dialogs aufgerufen (Schaltfläche, Hintergrund, Escape, nach Übernehmen). */
  onClose(): void;
}

function docFrom(img: DecodedImage): PixelDocument {
  const d = new PixelDocument(img.width, img.height);
  for (let i = 0; i < img.pixels.length; i++) d.data[i] = img.pixels[i];
  return d;
}

/** Dialog beim Öffnen eines Klexel-Links: Vorschau, PNG speichern, in Klexel bearbeiten. */
export function createLinkOpenDialog(deps: LinkOpenDeps): { open(image: DecodedImage, colors: number): void } {
  const dlg = document.createElement('dialog');
  dlg.id = 'linkDlg';
  dlg.setAttribute('aria-label', 'Bild aus Link');
  dlg.innerHTML = `
    <div class="sh">
      <h2>Bild aus einem Klexel-Link</h2>
      <canvas class="sh-preview" width="1" height="1"></canvas>
      <p class="sh-info" role="status"></p>
      <div class="sh-actions">
        <button type="button" class="lk-png">PNG speichern</button>
        <button type="button" class="lk-edit">In Klexel bearbeiten</button>
        <button type="button" class="lk-close">Schließen</button>
      </div>
    </div>`;
  document.getElementById('app')!.appendChild(dlg);

  const q = <T extends Element>(sel: string) => dlg.querySelector<T>(sel)!;
  const preview = q<HTMLCanvasElement>('.sh-preview');
  const info = q<HTMLElement>('.sh-info');
  let current: DecodedImage | null = null;

  q<HTMLButtonElement>('.lk-png').onclick = async () => {
    if (!current) return;
    try {
      const scale = Math.max(1, Math.floor(512 / Math.max(current.width, current.height)));
      await saveBlob(await exportPng(docFrom(current), scale), 'klexel.png', 'image/png');
    } catch (err) {
      console.error(err);
      showToast('Speichern fehlgeschlagen');
    }
  };
  q<HTMLButtonElement>('.lk-edit').onclick = () => {
    if (!current) return;
    if (docHasContent(deps.getDoc()) && !confirm('Das aktuelle Bild wird ersetzt. Fortfahren?')) return;
    const d = docFrom(current);
    dlg.close();
    deps.onApply(d);
  };
  q<HTMLButtonElement>('.lk-close').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => deps.onClose());

  return {
    open(image, colors) {
      current = image;
      drawDecoded(preview, image);
      info.textContent = `${image.width}×${image.height} Pixel, ${colors} ${colors === 1 ? 'Farbe' : 'Farben'}`;
      if (!dlg.open) dlg.showModal();
    },
  };
}
