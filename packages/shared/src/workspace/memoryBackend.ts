import type { KvBackend } from './types';

// Speicher im Arbeitsspeicher für Tests; protokolliert die gelesenen Schlüssel
export class MemoryBackend implements KvBackend {
  readonly data = new Map<string, unknown>();
  readonly reads: string[] = [];

  async get(key: string): Promise<unknown> {
    this.reads.push(key);
    return this.data.has(key) ? structuredClone(this.data.get(key)) : undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    // Kopie wie bei IndexedDB; der Umweg über die Ereignisschleife macht Wettläufe sichtbar
    await Promise.resolve();
    this.data.set(key, structuredClone(value));
  }
  async del(key: string): Promise<void> { this.data.delete(key); }
}
