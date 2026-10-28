import type { SelectionEdge } from '../model/Selection';

export interface EdgeRun { x: number; y: number; dir: 'h' | 'v'; len: number }

const cache = new WeakMap<SelectionEdge[], EdgeRun[]>();
const key = (x: number, y: number) => x + y * 65536;

/** Fasst aufeinanderfolgende gleichgerichtete Kanten zu Linienzügen zusammen (pro Kantenliste gecacht). */
export function edgeRuns(edges: SelectionEdge[]): EdgeRun[] {
  const hit = cache.get(edges);
  if (hit) return hit;
  const h = new Set<number>(), v = new Set<number>();
  for (const e of edges) (e.dir === 'h' ? h : v).add(key(e.x, e.y));
  const out: EdgeRun[] = [];
  for (const e of edges) {
    const set = e.dir === 'h' ? h : v;
    const px = e.dir === 'h' ? e.x - 1 : e.x, py = e.dir === 'h' ? e.y : e.y - 1;
    if (set.has(key(px, py))) continue;
    let len = 1;
    while (set.has(e.dir === 'h' ? key(e.x + len, e.y) : key(e.x, e.y + len))) len++;
    out.push({ x: e.x, y: e.y, dir: e.dir, len });
  }
  cache.set(edges, out);
  return out;
}

const whiteCache = new WeakMap<SelectionEdge[], SelectionEdge[]>();

/**
 * Einzelkanten, die im Rahmen weiß gezeichnet werden (Rest schwarz): Parität von x + y.
 * Absolute Position statt Strichmuster, damit auch kurze Läufe (Diagonalen, Dithering) beide Farben zeigen.
 */
export function whiteEdges(edges: SelectionEdge[]): SelectionEdge[] {
  const hit = whiteCache.get(edges);
  if (hit) return hit;
  const out = edges.filter(e => (e.x + e.y) % 2 === 0);
  whiteCache.set(edges, out);
  return out;
}
