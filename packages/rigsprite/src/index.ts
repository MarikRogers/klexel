// Öffentliche Schnittstelle des Rigsprite-Pakets für die Suite.
// Der Editor (React, rigspriteArea) liegt bewusst NICHT hier: rigspriteDescriptor.load() lädt ihn per dynamischem
// Import, damit er samt React und Styles ein eigener Chunk bleibt.
export { rigspriteDescriptor } from './descriptor';
export { AREA_MARKER, AREA_MARKER_RIGSPRITE } from './marker';
export type { Project } from './core/project';
