import type { ProjectMeta } from '@suite/shared';
import { MAX_IMAGE_SIZE } from '@suite/shared';
import { NEW_PROJECT_SIZE, areaSegments, defaultNewKind, filterProjects, formatUpdated, kindBadge, parseSize, projectBadges, showKindChoice } from './listModel';

export interface ProjectListDeps {
  list(): Promise<ProjectMeta[]>;
  currentId(): string | null;
  /** Arten, die sich in diesem Build öffnen lassen */
  canOpen(meta: ProjectMeta): boolean;
  open(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  duplicate(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Neues Projekt der Art kind; Breite/Höhe nur bei Arten mit Größenwahl (sonst ignoriert) */
  create(kind: string, width: number, height: number): Promise<void>;
  /** Zum Bereich kind wechseln: dessen zuletzt geändertes Projekt öffnen, sonst ein leeres anlegen */
  switchArea(kind: string): Promise<void>;
  /** Bereiche dieses Builds in fester Reihenfolge: Art, Anzeigename, fragt „Neu" nach der Größe? */
  kinds: ReadonlyArray<{ kind: string; title: string; sized: boolean }>;
  /** Art des offenen Projekts (Vorwahl für „Neues Projekt") */
  currentKind(): string | null;
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
      <div class="pl-areas" role="radiogroup" aria-label="Bereich" hidden></div>
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
  const areas = q<HTMLElement>('.pl-areas');
  let all: ProjectMeta[] = [];
  let busy = false;
  const kindIds = deps.kinds.map(k => k.kind);
  const titles = Object.fromEntries(deps.kinds.map(k => [k.kind, k.title]));

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

  /** Umschalter „Klexel | Rigsprite": zeigt den Bereich des offenen Projekts; der andere wechselt dorthin. */
  function renderAreas(): void {
    const segs = areaSegments(deps.kinds, deps.currentKind());
    areas.hidden = segs === null;
    areas.replaceChildren(...(segs ?? []).map(s => {
      const b = button(s.title, 'pl-area', () => {
        if (!s.current) void act(async () => { await deps.switchArea(s.kind); dlg.close(); });
      });
      b.dataset.kind = s.kind;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(s.current));
      b.title = s.current ? `${s.title} (geöffnet)` : `Zu ${s.title} wechseln`;
      return b;
    }));
  }

  function render(): void {
    renderAreas();
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
      for (const b of projectBadges(m, cur, usable, kindBadge(m, kindIds, usable, titles))) {
        meta.append(el('span', 'pl-badge' + (b.off ? ' off' : '') + (b.kind ? ` kind kind-${m.kind}` : ''), b.text));
      }
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
    const mk = (text: string, value: number) => {
      const label = el('label', '', text);
      const input = el('input');
      input.type = 'number'; input.min = '1'; input.max = String(MAX_IMAGE_SIZE); input.step = '1'; input.value = String(value);
      input.inputMode = 'numeric';
      label.append(input);
      return { label, input };
    };
    const w = mk('Breite', NEW_PROJECT_SIZE.width), h = mk('Höhe', NEW_PROJECT_SIZE.height);
    const hint = el('p', 'pl-hint', `1 bis ${MAX_IMAGE_SIZE} Pixel`);
    let kind = defaultNewKind(deps.currentKind(), kindIds) ?? '';
    const sized = () => deps.kinds.find(k => k.kind === kind)?.sized ?? false;
    const sizeFields = [w.label, h.label, hint];
    const syncSize = () => { for (const e of sizeFields) e.hidden = !sized(); };
    const body: HTMLElement[] = [];
    if (showKindChoice(kindIds)) {
      // Art als Umschalter (Segmente), vorgewählt die Art des offenen Projekts
      const group = el('div', 'pl-kinds');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', 'Art');
      for (const k of deps.kinds) {
        const b = el('button', 'pl-kind', k.title);
        b.type = 'button';
        b.dataset.kind = k.kind;
        b.setAttribute('role', 'radio');
        const sync = () => b.setAttribute('aria-checked', String(k.kind === kind));
        b.onclick = () => {
          kind = k.kind;
          for (const x of group.querySelectorAll<HTMLButtonElement>('.pl-kind')) x.setAttribute('aria-checked', String(x.dataset.kind === kind));
          syncSize();
        };
        sync();
        group.append(b);
      }
      body.push(group);
    }
    body.push(...sizeFields);
    syncSize();
    const valid = () => !sized() || (parseSize(w.input.value) !== null && parseSize(h.input.value) !== null);
    const ok = await ask({
      title: 'Neues Projekt', body, ok: 'Anlegen',
      validate: () => { const v = valid(); hint.classList.toggle('error', !v); return v; },
    });
    if (!ok || !valid()) return;
    const [width, height] = sized() ? [parseSize(w.input.value)!, parseSize(h.input.value)!] : [NEW_PROJECT_SIZE.width, NEW_PROJECT_SIZE.height];
    await act(async () => { await deps.create(kind, width, height); dlg.close(); });
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
