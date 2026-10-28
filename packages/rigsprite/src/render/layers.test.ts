import { describe, expect, it } from 'vitest';
import type { DrawItem } from '../core/frame';
import { createLayerCache, layerDepths, orderLayers } from './layers';
import type { ViewTransform } from './view';

function item(partId: string, z: number): DrawItem {
  return { partId, imageId: 'i', positions: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint16Array(0), z };
}

const view = (yaw: number): ViewTransform => ({
  x: 0, y: 0, zoom: 1, rotation: 0, yaw, pitch: 0, mirror: false, width: 100, height: 100,
});

const items = [item('a', 0), item('b', 5), item('c', 5), item('d', 100)];

describe('layerDepths', () => {
  it('centres the dense z ranks on the rig plane', () => {
    expect(layerDepths(items, 12)).toEqual([-12, 0, 0, 12]);
  });

  it('is 0 for spacing 0 and for a single z', () => {
    expect(layerDepths(items, 0).map((d) => d + 0)).toEqual([0, 0, 0, 0]);
    expect(layerDepths([item('a', 3), item('b', 3)], 12).map((d) => d + 0)).toEqual([0, 0]);
  });
});

describe('orderLayers', () => {
  it('keeps the order in the front view', () => {
    const layers = orderLayers(items, view(0), 12);
    expect(layers.map((l) => l.item.partId)).toEqual(['a', 'b', 'c', 'd']);
    expect(layers.map((l) => l.depth)).toEqual([-12, 0, 0, 12]);
  });

  it('reverses the layers in the back view, keeping the order within a layer', () => {
    const layers = orderLayers(items, view(180), 12);
    expect(layers.map((l) => l.item.partId)).toEqual(['d', 'b', 'c', 'a']);
    expect(layers.map((l) => l.depth)).toEqual([12, 0, 0, -12]);
  });

  it('counts yaw 90 as front view', () => {
    expect(orderLayers(items, view(90), 12).map((l) => l.item.partId)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('createLayerCache', () => {
  it('equals orderLayers and is reused while items, back view and spacing are unchanged', () => {
    const layers = createLayerCache();
    const a = layers(items, view(10), 12);
    expect(a).toEqual(orderLayers(items, view(10), 12));
    expect(layers(items, view(-30), 12)).toBe(a);
    const back = layers(items, view(180), 12);
    expect(back).not.toBe(a);
    expect(back).toEqual(orderLayers(items, view(180), 12));
    expect(layers(items, view(180), 6)).not.toBe(back);
    expect(layers([...items], view(180), 6)).not.toBe(back);
  });
});
