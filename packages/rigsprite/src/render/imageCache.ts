/** The renderer side of the image cache (SkinRenderer implements it). */
export interface ImageTarget {
  setImage(id: string, img: HTMLImageElement, pixelArt: boolean): void;
  setFilter(id: string, pixelArt: boolean): void;
  removeImage(id: string): void;
}

interface LoadedImage {
  dataUrl: string;
  img: HTMLImageElement;
  loaded: boolean;
}

export interface ImageCache {
  /** Brings the target in line with the project images; a no-op unless `images` or `pixelArt` changed. */
  sync(images: Readonly<Record<string, { dataUrl: string }>>, pixelArt: boolean): void;
  /** Ignores loads that finish afterwards. */
  dispose(): void;
}

/**
 * Decodes project images and uploads them to `target` once loaded (`onLoaded` then asks for a
 * redraw). Changed data URLs are re-decoded, removed images dropped; a Pixel-Art toggle only switches
 * the texture filter of loaded images.
 */
export function createImageCache(
  target: ImageTarget,
  onLoaded: () => void,
  createImage: () => HTMLImageElement = () => new Image(),
): ImageCache {
  const entries = new Map<string, LoadedImage>();
  let synced: object | null = null;
  let pixelArt: boolean | null = null;
  let disposed = false;

  return {
    sync(images, nextPixelArt) {
      if (images === synced && nextPixelArt === pixelArt) return;
      synced = images;
      const pixelArtChanged = nextPixelArt !== pixelArt;
      pixelArt = nextPixelArt;
      for (const [id, entry] of entries) {
        if (images[id]?.dataUrl !== entry.dataUrl) {
          target.removeImage(id);
          entries.delete(id);
        } else if (pixelArtChanged && entry.loaded) {
          target.setFilter(id, nextPixelArt);
        }
      }
      for (const [id, asset] of Object.entries(images)) {
        if (entries.has(id)) continue;
        const entry: LoadedImage = { dataUrl: asset.dataUrl, img: createImage(), loaded: false };
        entries.set(id, entry);
        entry.img.onload = () => {
          if (disposed || entries.get(id) !== entry) return;
          entry.loaded = true;
          target.setImage(id, entry.img, pixelArt ?? false);
          onLoaded();
        };
        entry.img.src = asset.dataUrl;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}
