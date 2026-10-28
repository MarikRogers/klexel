import type { ProjectMeta } from '@suite/shared';
import { filterProjects, formatUpdated, parseSize } from './listModel';

export interface ProjectListDeps {
  list(): Promise<ProjectMeta[]>;
  currentId(): string | null;
  /** Arten, die sich in diesem Build öffnen lassen */
  canOpen(meta: ProjectMeta): boolean;
  open(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  duplicate(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  create(width: number, height: number): Promise<void>;
  exportAll(): Promise<void>;
  exportOne(meta: ProjectMeta): Promise<void>;
  importFile(file: File): Promise<void>;
}

export interface ProjectList {
  open(): void;
  /** Neu zeichnen, falls die Liste gerade offen ist (z. B. nach einem Autosave mit neuer Vorschau) */
  refresh(): void;
}

const MAX_NAME = 60;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.onclick = onClick;
  return b;
}

/** Kleiner modaler Rückfrage-Dialog; liefert true bei „OK". */
function ask(opts: { title: string; body?: HTMLElement[]; ok: string; danger?: boolean; onShow?: () => void; validate?: () => boolean }): Promise<boolean> {
  const dlg = el('dialog', 'pl-ask');
  const form = el('form');
  form.method = 'dialog';
  form.append(el('h2', '', opts.title), ...(opts.body ?? []));
  const actions = el('div', 'pl-ask-actions');
  // Abbrechen ist kein Absende-Knopf: Enter im Eingabefeld soll „OK" auslösen, nicht den ersten Knopf
  const cancel = el('button', '', 'Abbrechen');
  cancel.type = 'button';
  cancel.onclick = () => dlg.close('cancel');
  const ok = el('button', opts.danger ? 'danger' : 'primary', opts.ok);
  ok.value = 'ok';
  actions.append(cancel, ok);
  form.append(actions);
  dlg.append(form);
  document.body.appendChild(dlg);
  form.addEventListener('submit', e => {
    const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value === 'ok' && opts.validate && !opts.validate()) e.preventDefault();
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close('cancel'); });
  return new Promise(res => {
    dlg.addEventListener('close', () => { res(dlg.returnValue === 'ok'); dlg.remove(); });
    dlg.showModal();
    opts.onShow?.();
  });
}

/** Projektliste als Dialog: Suche, „Neues Projekt", je Projekt Vorschau, Name, Datum und Aktionen. */
export function createProjectList(deps: ProjectListDeps): ProjectList {
  const dlg = el('dialog');
  dlg.id = 'projectsDlg';
  dlg.setAttribute('aria-label', 'Projekte');
  dlg.innerHTML = `
    <div class="pl">
      <div class="pl-head">
        <h2>Projekte</h2>
        <button type="button" class="pl-close" aria-label="Schließen" title="Schließen">✕</button>
      </div>
      <div class="pl-tools">
        <input type="search" class="pl-search" placeholder="Suchen …" aria-label="Projekte suchen" />
        <button type="button" class="pl-new primary">＋ Neues Projekt</button>
      </div>
      <div class="pl-file">
        <button type="button" class="pl-save-all">Alle Projekte sichern</button>
        <button type="button" class="pl-load">Datei laden …</button>
        <input type="file" class="pl-file-input" accept=".json,application/json" hidden />
      </div>
      <p class="pl-empty" hidden></p>
      <ul class="pl-items"></ul>
    </div>`;
  document.body.appendChild(dlg);
  const q = <T extends Element>(sel: string) => dlg.querySelector<T>(sel)!;
  const search = q<HTMLInputElement>('.pl-search');
  const items = q<HTMLUListElement>('.pl-items');
  const empty = q<HTMLElement>('.pl-empty');
  let all: ProjectMeta[] = [];
  let busy = false;

  // Aktionen nacheinander; währenddessen sind die Schaltflächen gesperrt
  async function act(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    dlg.classList.add('busy');
    try { await fn(); } catch (err) { console.error(err); } finally {
      busy = false;
      dlg.classList.remove('busy');
      if (dlg.open) await load();
    }
  }

  function render(): void {
    const shown = filterProjects(all, search.value);
    items.replaceChildren();
    empty.hidden = shown.length > 0;
    empty.textContent = all.length === 0 ? 'Noch keine Projekte.' : 'Kein Projekt passt zur Suche.';
    const cur = deps.currentId();
    const now = Date.now();
    for (const m of shown) {
      const usable = deps.canOpen(m);
      const li = el('li', 'pl-item' + (m.id === cur ? ' current' : '') + (usable ? '' : ' unavailable'));
      const thumb = el('div', 'pl-thumb');
      if (m.thumbnail) {
        const img = el('img');
        img.src = m.thumbnail;
        img.alt = '';
        thumb.append(img);
      }
      const info = el('div', 'pl-info');
      const name = el('div', 'pl-name', m.name);
      name.title = m.name;
      const meta = el('div', 'pl-meta', formatUpdated(m.updatedAt, now));
      if (m.id === cur) meta.append(el('span', 'pl-badge', 'geöffnet'));
      if (!usable) meta.append(el('span', 'pl-badge off', 'nicht verfügbar'));
      info.append(name, meta);
      const actions = el('div', 'pl-actions');
      const openBtn = button('Öffnen', 'primary', () => void act(async () => { await deps.open(m.id); dlg.close(); }));
      openBtn.disabled = !usable;
      const dupBtn = button('Duplizieren', '', () => void act(() => deps.duplicate(m.id)));
      dupBtn.disabled = !usable;
      actions.append(
        openBtn,
        button('Umbenennen', '', () => void renameDialog(m)),
        dupBtn,
        button('Als Datei sichern', '', () => void act(() => deps.exportOne(m))),
        button('Löschen', 'danger', () => void removeDialog(m)),
      );
      li.append(thumb, info, actions);
      items.append(li);
    }
  }

  async function load(): Promise<void> {
    try { all = await deps.list(); } catch (err) { console.error(err); all = []; }
    render();
  }

  async function renameDialog(m: ProjectMeta): Promise<void> {
    const label = el('label', '', 'Name');
    const input = el('input', 'pl-name-input');
    input.type = 'text';
    input.maxLength = MAX_NAME;
    input.value = m.name;
    label.append(input);
    const ok = await ask({
      title: 'Umbenennen', body: [label], ok: 'Speichern',
      onShow: () => { input.focus(); input.select(); },
      validate: () => input.value.trim().length > 0,
    });
    const name = input.value.trim().slice(0, MAX_NAME);
    if (ok && name && name !== m.name) await act(() => deps.rename(m.id, name));
  }

  async function removeDialog(m: ProjectMeta): Promise<void> {
    const ok = await ask({
      title: 'Projekt löschen?',
      body: [el('p', '', `„${m.name}" wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.`)],
      ok: 'Löschen', danger: true,
    });
    if (ok) await act(() => deps.remove(m.id));
  }

  async function newDialog(): Promise<void> {
    const mk = (text: string) => {
      const label = el('label', '', text);
      const input = el('input');
      input.type = 'number'; input.min = '1'; input.max = '128'; input.step = '1'; input.value = '32';
      input.inputMode = 'numeric';
      label.append(input);
      return { label, input };
    };
    const w = mk('Breite'), h = mk('Höhe');
    const hint = el('p', 'pl-hint', '1 bis 128 Pixel');
    const valid = () => parseSize(w.input.value) !== null && parseSize(h.input.value) !== null;
    const ok = await ask({
      title: 'Neues Projekt', body: [w.label, h.label, hint], ok: 'Anlegen',
      validate: () => { const v = valid(); hint.classList.toggle('error', !v); return v; },
    });
    if (!ok || !valid()) return;
    await act(async () => { await deps.create(parseSize(w.input.value)!, parseSize(h.input.value)!); dlg.close(); });
  }

  q<HTMLButtonElement>('.pl-close').onclick = () => dlg.close();
  const fileInput = q<HTMLInputElement>('.pl-file-input');
  q<HTMLButtonElement>('.pl-save-all').onclick = () => void act(() => deps.exportAll());
  q<HTMLButtonElement>('.pl-load').onclick = () => fileInput.click();
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (f) void act(() => deps.importFile(f));
  });
  q<HTMLButtonElement>('.pl-new').onclick = () => void newDialog();
  search.addEventListener('input', render);
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  return {
    open() {
      search.value = '';
      if (!dlg.open) dlg.showModal();
      void load();
    },
    refresh() {
      if (dlg.open && !busy) void load();
    },
  };
}
