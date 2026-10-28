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

describe('orderLayers with part depth', () => {
  const deep = (partId: string, z: number, depth: number): DrawItem => ({ ...item(partId, z), depth });

  it('draws the part nearer to the camera last in the front view, whatever its z', () => {
    const layers = orderLayers([deep('near', 0, 5), deep('far', 9, -5), deep('mid', 3, 0)], view(0), 12);
    expect(layers.map((l) => l.item.partId)).toEqual(['far', 'mid', 'near']);
  });

  it('draws it first in the back view (the camera looks from behind)', () => {
    const layers = orderLayers([deep('near', 0, 5), deep('far', 9, -5), deep('mid', 3, 0)], view(180), 12);
    expect(layers.map((l) => l.item.partId)).toEqual(['near', 'mid', 'far']);
  });

  it('rounds depths to whole pixels, then the z layer decides', () => {
    const layers = orderLayers([deep('a', 5, 0.4), deep('b', 1, 0)], view(0), 12);
    expect(layers.map((l) => l.item.partId)).toEqual(['b', 'a']);
    const apart = orderLayers([deep('a', 5, 1.6), deep('b', 1, 0)], view(0), 12);
    expect(apart.map((l) => l.item.partId)).toEqual(['b', 'a']);
    const behind = orderLayers([deep('a', 5, -1.6), deep('b', 1, 0)], view(0), 12);
    expect(behind.map((l) => l.item.partId)).toEqual(['a', 'b']);
  });

  it('adds the part depth to the layer depth', () => {
    const layers = orderLayers([deep('a', 0, 4), deep('b', 5, 0)], view(0), 12);
    expect(layers.find((l) => l.item.partId === 'a')!.depth).toBe(-6 + 4);
    expect(layers.find((l) => l.item.partId === 'b')!.depth).toBe(6);
  });

  it('items without depth keep the exact old order and depths', () => {
    expect(orderLayers(items, view(0), 12).map((l) => l.depth)).toEqual([-12, 0, 0, 12]);
  });
});
