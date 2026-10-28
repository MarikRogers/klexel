export interface AutosaveOptions {
  /** Schreibt den aktuellen Stand (liest ihn selbst beim Aufruf) */
  save: () => Promise<void>;
  /** Wartezeit nach der letzten Änderung (Standard 400 ms) */
  delayMs?: number;
  /** Wird bei jedem gescheiterten Schreibvorgang aufgerufen (Standard: console.error) */
  onError?: (err: unknown) => void;
}

export interface Autosave {
  /** Änderung vormerken; geschrieben wird nach delayMs ohne weitere Änderung */
  schedule(): void;
  /** Sofort schreiben (falls etwas offen ist) und auf laufende Schreibvorgänge warten; lehnt ab, wenn das Schreiben scheitert */
  flush(): Promise<void>;
  /** Vorgemerkte Änderung verwerfen (z. B. weil das Projekt gelöscht wurde); ein laufender Schreibvorgang läuft zu Ende */
  cancel(): void;
  /** Gibt es ungesicherte Änderungen? */
  pending(): boolean;
}

/** Entprelltes Speichern; Schreibvorgänge laufen nie parallel. Nach einem Fehler bleibt die Änderung offen. */
export function createAutosave(opts: AutosaveOptions): Autosave {
  const delay = opts.delayMs ?? 400;
  const report = opts.onError ?? (err => console.error(err));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let chain: Promise<void> = Promise.resolve();

  const clearTimer = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };

  function write(): Promise<void> {
    const run = chain.then(async () => {
      if (!dirty) return;
      dirty = false;
      try {
        await opts.save();
      } catch (err) {
        dirty = true; // nicht gesichert: beim nächsten schedule/flush erneut versuchen
        report(err);
        throw err;
      }
    });
    chain = run.catch(() => undefined);
    return run;
  }

  return {
    schedule() {
      dirty = true;
      clearTimer();
      timer = setTimeout(() => { timer = null; write().catch(() => undefined); }, delay);
    },
    flush() {
      clearTimer();
      return write();
    },
    cancel() {
      clearTimer();
      dirty = false;
    },
    pending: () => dirty,
  };
}
