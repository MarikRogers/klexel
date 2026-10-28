import { describe, it, expect } from 'vitest';
import { compositeLayers, blendOver } from '@suite/shared';
import { PixelDocument } from './Document';

type L = { visible: boolean; opacity: number; cel?: Uint32Array };

// Kopie des alten Algorithmus (Stand e03f0d9) mit Schnellpfad
function oldFast(layers: L[], n: number): Uint32Array {
  const out = new Uint32Array(n);
  for (const layer of layers) {
    if (!layer.visible || layer.opacity === 0) continue;
    const data = layer.cel;
    if (!data) continue;
    const opaque = layer.opacity === 100;
    for (let i = 0; i < n; i++) {
      const s = data[i];
      if (s === 0) continue;
      out[i] = opaque && ((s & 255) === 255 || out[i] === 0) ? s : blendOver(out[i], s, layer.opacity);
    }
  }
  return out;
}

// Variante ohne Schnellpfad: immer blendOver
function oldSlow(layers: L[], n: number): Uint32Array {
  const out = new Uint32Array(n);
  for (const layer of layers) {
    if (!layer.visible || layer.opacity === 0 || !layer.cel) continue;
    for (let i = 0; i < n; i++) if (layer.cel[i] !== 0) out[i] = blendOver(out[i], layer.cel[i], layer.opacity);
  }
  return out;
}

const px = (seed: number, n: number) =>
  Uint32Array.from({ length: n }, (_, i) => ((i + seed) % 3 === 0 ? 0 : ((Math.imul(seed * 7919 + i * 104729 + 1, 2654435761) >>> 0) | 1) >>> 0)); // Alpha nie 0 (alpha-0-Pixel mit Farbe behandelt nur der Schnellpfad abweichend)

function build(opacities: number[], hiddenIdx: number, noCelIdx: number) {
  const doc = new PixelDocument(4, 2);
  const fid = doc.currentFrameId;
  const layers = [doc.layers[0]];
  for (let k = 1; k < opacities.length; k++) { const l = doc.createLayer(); doc.insertLayer(l, k); layers.push(l); }
  layers.forEach((l, k) => {
    if (k !== noCelIdx) doc.ensureCel(l.id, fid).set(px(k + 1, 8));
    doc.setLayerProps(l.id, { opacity: opacities[k], visible: k !== hiddenIdx });
  });
  doc.touch();
  const spec: L[] = doc.layers.map(l => ({ visible: l.visible, opacity: l.opacity, cel: l.cels.get(fid) }));
  return { doc, fid, spec };
}

describe('Frame-Zusammenrechnen gegen alte Referenz', () => {
  const fixtures: Array<[string, number[], number, number]> = [
    ['100/50/33 + versteckt', [100, 50, 33, 80], 3, -1],
    ['100/50/33 + Ebene ohne Cel', [100, 50, 33, 70], -1, 1],
    ['versteckte Mitte, ohne Cel oben', [60, 100, 33, 50], 1, 3],
    ['Deckkraft 0 und 100', [100, 0, 100, 50], -1, -1],
  ];
  it.each(fixtures)('%s: doc, compositeLayers und beide Referenzen sind bitgleich', (_n, ops, hidden, noCel) => {
    const { doc, fid, spec } = build(ops, hidden, noCel);
    const fast = [...oldFast(spec, 8)];
    expect([...oldSlow(spec, 8)]).toEqual(fast);
    expect([...doc.compositeFrame(fid)]).toEqual(fast);
    expect([...compositeLayers(spec, 8)]).toEqual(fast);
  });

  it('feste Golden-Werte', () => {
    const { doc, fid } = build([100, 50, 33, 80], 3, -1);
    expect([...doc.compositeFrame(fid)].map(v => v.toString(16).padStart(8, '0'))).toEqual(GOLDEN);
  });
});
const GOLDEN = ["c045c3f2", "932b5368", "33fe8461", "13c8d1cc", "77b34942", "908ab881", "6f547bcf", "762777f1"];
