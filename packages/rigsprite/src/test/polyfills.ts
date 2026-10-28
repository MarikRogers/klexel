/** jsdom's Blob has no text(); polyfill it via FileReader. */
export function polyfillBlobText(): void {
  if (typeof Blob.prototype.text === 'function') return;
  Blob.prototype.text = function (this: Blob) {
    return new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(this);
    });
  };
}
