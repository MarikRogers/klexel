// Frame-Zusammenrechnen (DOM-frei): gemeinsam für Klexel und Rigsprite.
export type Color = number; // 0xRRGGBBAA

// Source-over mit nicht-prämultipliziertem Alpha; srcOpacity 0..100
export function blendOver(dst: Color, src: Color, srcOpacity: number): Color {
  const sa = ((src & 255) / 255) * (srcOpacity / 100);
  const da = (dst & 255) / 255;
  const outA = sa + da * (1 - sa);
  if (outA === 0) return 0;
  const k = da * (1 - sa);
  const r = Math.round((((src >>> 24) & 255) * sa + ((dst >>> 24) & 255) * k) / outA);
  const g = Math.round((((src >>> 16) & 255) * sa + ((dst >>> 16) & 255) * k) / outA);
  const b = Math.round((((src >>> 8) & 255) * sa + ((dst >>> 8) & 255) * k) / outA);
  const out = (r * 256 + g) * 256 + b;
  return (out * 256 + Math.round(outA * 255)) >>> 0;
}

export interface CompositeLayer {
  visible: boolean;
  /** ganzzahlig 0..100 */
  opacity: number;
  /** fehlende Cel = vollständig transparent */
  cel?: Uint32Array;
}

/**
 * Rechnet Ebenen (unterste zuerst) zu einem Bild aus `length` Pixeln zusammen.
 * Unsichtbare Ebenen und Ebenen mit Deckkraft 0 werden übersprungen. Eine Cel mit
 * falscher Länge wird ignoriert (wie eine fehlende Cel), sie wirft nicht.
 */
export function compositeLayers(layers: readonly CompositeLayer[], length: number): Uint32Array {
  const out = new Uint32Array(length);
  for (const layer of layers) {
    if (!layer.visible || layer.opacity === 0) continue;
    const data = layer.cel;
    if (!data || data.length !== length) continue;
    const opaque = layer.opacity === 100;
    for (let i = 0; i < length; i++) {
      const s = data[i];
      if (s === 0) continue;
      // Schnellpfad: deckendes Pixel bei 100 % ersetzt das Ergebnis, ebenso über Transparent
      out[i] = opaque && ((s & 255) === 255 || out[i] === 0) ? s : blendOver(out[i], s, layer.opacity);
    }
  }
  return out;
}
