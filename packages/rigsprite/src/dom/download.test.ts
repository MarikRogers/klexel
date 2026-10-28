// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { download } from './download';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('download', () => {
  it('clicks a temporary anchor with the filename, then removes it and revokes the URL later', () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
    let seen: { href: string; download: string; inDom: boolean } | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      seen = { href: this.href, download: this.download, inDom: document.body.contains(this) };
    });

    download(new Blob(['x']), 'file.txt');

    expect(seen).toEqual({ href: 'blob:fake', download: 'file.txt', inDom: true });
    expect(document.querySelector('a')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });
});
