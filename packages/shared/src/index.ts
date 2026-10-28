// Gemeinsame, DOM-freie Schicht der Suite: Workspace (Projekte, Speicher, Dateiformat) und Bereichs-Vertrag.
export type { ProjectKind, ProjectMeta, KvBackend } from './workspace/types';
export { WorkspaceStore, newProjectId } from './workspace/store';
export { MemoryBackend } from './workspace/memoryBackend';
export { IdbBackend } from './workspace/idbBackend';
export { migrateLegacy } from './workspace/migrateLegacy';
export { exportWorkspace, importWorkspace, cleanName } from './workspace/file';
export type { WorkspaceFile, ImportResult } from './workspace/file';
export type { Area, AreaHandle, AreaHost, NewProjectInit } from './area';
export { MAX_IMAGE_SIZE } from './area';
export type { AreaDescriptor } from './areaDescriptor';
export { DEFAULT_AUTOSAVE_DELAY_MS } from './areaDescriptor';
export type { SourceFrame, SourceResult, PixelFrame, SourceService } from './sources';
export type { FramesDocFrame, FramesDocInput, ReturnRequest, ReturnResult } from './returnDoc';
export type { Color, CompositeLayer } from './composite';
export { blendOver, compositeLayers } from './composite';
