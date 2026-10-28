import type { DrawItem } from '../core/frame';
import { isBackView, type ViewTransform } from './view';

/** A sprite together with its depth (offset from the rig plane, towards the front camera). */
export interface Layer {
  item: DrawItem;
  depth: number;
}

/** Dense rank of each item's z among the distinct z values (ascending). */
function ranks(items: DrawItem[]): { rank: number[]; count: number } {
  const distinct = [...new Set(items.map((i) => i.z))].sort((a, b) => a - b);
  const index = new Map(distinct.map((z, r) => [z, r]));
  return { rank: items.map((i) => index.get(i.z)!), count: distinct.length };
}

function depthsOf(rank: number[], count: number, spacing: number): number[] {
  return rank.map((r) => (r - (count - 1) / 2) * spacing);
}

/** Depth per item: dense z rank centred on the rig plane, times `spacing` (same order as `items`). */
export function layerDepths(items: DrawItem[], spacing: number): number[] {
  const { rank, count } = ranks(items);
  return depthsOf(rank, count, spacing);
}

/**
 * Draw order of the sprites with their depths: as `items` (z ascending, stable); seen from behind the
 * layers (ranks) are drawn in reverse order, items within one layer keep their order.
 */
export function orderLayers(items: DrawItem[], view: ViewTransform, spacing: number): Layer[] {
  const { rank, count } = ranks(items);
  const depths = depthsOf(rank, count, spacing);
  const order = items.map((_, i) => i);
  if (isBackView(view)) order.sort((a, b) => rank[b] - rank[a] || a - b);
  return order.map((i) => ({ item: items[i], depth: depths[i] }));
}

/**
 * orderLayers with a memory of the last result: reordered only when the items (by reference), the
 * back-view flag or the spacing change, so view changes and pointer moves reuse the layers.
 */
export function createLayerCache(): (items: DrawItem[], view: ViewTransform, spacing: number) => Layer[] {
  let key: { items: DrawItem[]; back: boolean; spacing: number } | null = null;
  let layers: Layer[] = [];
  return (items, view, spacing) => {
    const back = isBackView(view);
    if (!key || key.items !== items || key.back !== back || key.spacing !== spacing) {
      key = { items, back, spacing };
      layers = orderLayers(items, view, spacing);
    }
    return layers;
  };
}
