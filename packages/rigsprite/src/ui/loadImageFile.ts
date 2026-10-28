import { newId } from '../core/id';
import { unsupportedImage } from '../core/messages';
import type { ImageAsset } from '../core/part';
import { loadImageElement, readDataUrl } from '../dom/imageIo';

export async function loadImageFile(file: File): Promise<ImageAsset> {
  const fail = () => new Error(unsupportedImage(file.name));
  if (!file.type.startsWith('image/')) throw fail();
  try {
    const dataUrl = await readDataUrl(file);
    const img = await loadImageElement(dataUrl);
    return { id: newId(), name: file.name, dataUrl, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    throw fail();
  }
}
