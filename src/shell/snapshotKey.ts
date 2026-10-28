import type { SavedState } from '../storage/state';

// Zwei unabhängige 32-Bit-Hashes (FNV-1a und ein multiplikativer) über alle Werte; zusammen 64 Bit
function mix(h: [number, number], v: number): void {
  h[0] = Math.imul(h[0] ^ v, 0x01000193) >>> 0;
  h[1] = (Math.imul(h[1] ^ (v >>> 16) ^ (v << 16), 0x85ebca6b) + 0x9e3779b9) >>> 0;
}

/**
 * Kurzer Schlüssel für einen Klexel-Stand: gleich bei gleichem Inhalt, verschieden bei jeder Änderung
 * (bis auf vernachlässigbare Kollisionen). Damit sichert die Hülle nur, wenn sich wirklich etwas geändert hat.
 */
export function snapshotKey(s: SavedState): string {
  const h: [number, number] = [0x811c9dc5, 0x12345678];
  const { layers, ...rest } = s;
  const head = JSON.stringify({ ...rest, layers: layers.map(({ cels, ...l }) => ({ ...l, cels: Object.keys(cels) })) });
  for (let i = 0; i < head.length; i++) mix(h, head.charCodeAt(i));
  for (const l of layers) {
    for (const k of Object.keys(l.cels)) {
      const cel = l.cels[k];
      mix(h, cel.length);
      for (let i = 0; i < cel.length; i++) mix(h, cel[i]);
    }
  }
  return `${h[0].toString(16)}-${h[1].toString(16)}-${head.length}`;
}
