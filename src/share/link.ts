import { encodeImage, decodeBody, toBase64Url, fromBase64Url, type DecodedImage } from './linkCodec';

export const LINK_OK_MAX = 2000;
export const LINK_WARN_MAX = 4000;

const VERSION = 1;
const FLAG_TRANSPARENT = 1;
const FLAG_COMPRESSED = 2;

export type ShareResult =
  | { ok: true; url: string; length: number; level: 'ok' | 'warn' }
  | { ok: false; reason: 'empty' | 'too-large' | 'too-many-colors' | 'too-long'; colors?: number; length?: number };

export type OpenError = 'corrupt' | 'newer' | 'no-decompress';
export type OpenResult = { ok: true; image: DecodedImage; colors: number } | { ok: false; error: OpenError };

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Baut den Link aus dem Bild; nimmt die Kompression nur, wenn der Wert dadurch kürzer wird. */
export async function createShareLink(img: DecodedImage, base: string): Promise<ShareResult> {
  const e = encodeImage(img.width, img.height, img.pixels);
  if (!e.ok) return { ok: false, reason: e.problem.kind, colors: e.problem.colors };
  const flags = e.transparent ? FLAG_TRANSPARENT : 0;
  const withHeader = (f: number, body: Uint8Array) => {
    const out = new Uint8Array(2 + body.length);
    out[0] = VERSION; out[1] = f; out.set(body, 2);
    return out;
  };
  let value = toBase64Url(withHeader(flags, e.body));
  if (typeof CompressionStream !== 'undefined') {
    try {
      const packed = await pipe(e.body, new CompressionStream('deflate-raw'));
      const candidate = toBase64Url(withHeader(flags | FLAG_COMPRESSED, packed));
      if (candidate.length < value.length) value = candidate;
    } catch { /* ohne Kompression weiter */ }
  }
  const url = base.split('#')[0] + '#i=' + value;
  if (url.length > LINK_WARN_MAX) return { ok: false, reason: 'too-long', length: url.length };
  return { ok: true, url, length: url.length, level: url.length > LINK_OK_MAX ? 'warn' : 'ok' };
}

/** Liest den `#`-Teil der Adresse. `null`, wenn er keinen Klexel-Link (`i=`) enthält. */
export async function readShareLink(hash: string): Promise<OpenResult | null> {
  const value = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('i');
  if (value === null) return null;
  const bytes = fromBase64Url(value);
  if (!bytes || bytes.length < 2) return { ok: false, error: 'corrupt' };
  if (bytes[0] > VERSION) return { ok: false, error: 'newer' };
  if (bytes[0] !== VERSION) return { ok: false, error: 'corrupt' };
  const flags = bytes[1];
  if (flags & ~(FLAG_TRANSPARENT | FLAG_COMPRESSED)) return { ok: false, error: 'corrupt' };
  let body = bytes.subarray(2);
  if (flags & FLAG_COMPRESSED) {
    if (typeof DecompressionStream === 'undefined') return { ok: false, error: 'no-decompress' };
    try { body = await pipe(body, new DecompressionStream('deflate-raw')); } catch { return { ok: false, error: 'corrupt' }; }
  }
  const d = decodeBody(body, (flags & FLAG_TRANSPARENT) !== 0);
  return d.ok ? { ok: true, image: d.image, colors: d.colors } : { ok: false, error: 'corrupt' };
}
