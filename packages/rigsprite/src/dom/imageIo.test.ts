// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadImageElement, readDataUrl } from './imageIo';

afterEach(() => vi.unstubAllGlobals());

describe('readDataUrl', () => {
  it('reads a file as a data URL', async () => {
    const url = await readDataUrl(new File(['hi'], 'a.txt', { type: 'text/plain' }));
    expect(url).toBe('data:text/plain;base64,aGk=');
  });
});

describe('loadImageElement', () => {
  const stubImage = (outcome: 'load' | 'error') => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 3;
      set src(_: string) {
        queueMicrotask(() => (outcome === 'load' ? this.onload : this.onerror)?.());
      }
    }
    vi.stubGlobal('Image', FakeImage);
  };

  it('resolves with the decoded image', async () => {
    stubImage('load');
    const img = await loadImageElement('data:image/png;base64,AAAA');
    expect(img.naturalWidth).toBe(3);
  });

  it('rejects with a German message when decoding fails', async () => {
    stubImage('error');
    await expect(loadImageElement('x')).rejects.toThrow('Bild konnte nicht geladen werden.');
  });
});
