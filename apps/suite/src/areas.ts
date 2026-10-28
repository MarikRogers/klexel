// Die einzige Stelle der Hülle, die Bereichs-Pakete kennt. Welche Bereiche enthalten sind, steht beim Bauen fest
// (VITE_AREAS → __AREA_*__ in vite.config.ts). Abgeschaltete Zweige sind dann `if (false)` und entfallen samt
// ihrem dynamischen Import: das Paket des Bereichs kommt nicht ins Bundle.
import type { AreaDescriptor, ProjectKind } from '@suite/shared';

export { enabledAreas } from './areaNames';

/** Beim Bauen gewählte Bereiche. */
export const AREAS: readonly ProjectKind[] = __AREAS__;

let loaded: Promise<AreaDescriptor<unknown>[]> | undefined;

/** Beschreibungen aller enthaltenen und eingebundenen Bereiche, in fester Reihenfolge (Klexel zuerst). */
export function loadDescriptors(): Promise<AreaDescriptor<unknown>[]> {
  loaded ??= (async () => {
    const out: AreaDescriptor<unknown>[] = [];
    if (__AREA_KLEXEL__) {
      const m = await import('@suite/klexel');
      out.push(m.klexelDescriptor as unknown as AreaDescriptor<unknown>);
    }
    if (__AREA_RIGSPRITE__) {
      const m = await import('@suite/rigsprite');
      out.push(m.rigspriteDescriptor as unknown as AreaDescriptor<unknown>);
    }
    return out;
  })();
  return loaded;
}

/** Beschreibung einer Art oder undefined, wenn der Bereich in diesem Build fehlt. */
export async function descriptorFor(kind: string): Promise<AreaDescriptor<unknown> | undefined> {
  return (await loadDescriptors()).find(d => d.kind === kind);
}
