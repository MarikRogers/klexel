import { FILE_UNREADABLE, IMAGE_LOAD_FAILED } from '../core/messages';

/** Reads a file as a `data:` URL. */
export function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(FILE_UNREADABLE));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Resolves once the browser has decoded the image at `src`. */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(IMAGE_LOAD_FAILED));
    img.src = src;
  });
}
