export type ProjectKind = 'klexel' | 'rigsprite';

export interface ProjectMeta {
  id: string;
  kind: ProjectKind;
  name: string;
  updatedAt: number;
  thumbnail?: string; // PNG-Data-URL
  origin?: { rigProjectId: string; animationId: string };
}

export interface KvBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}
