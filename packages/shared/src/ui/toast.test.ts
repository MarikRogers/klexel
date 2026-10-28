// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast } from './toast';

const toast = () => document.querySelector<HTMLElement>('.toast');

function openDialog(): HTMLDialogElement {
  const dlg = document.createElement('dialog');
  dlg.setAttribute('open', '');
  document.body.appendChild(dlg);
  return dlg;
}

beforeEach(() => { document.body.replaceChildren(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('showToast', () => {
  it('ohne Dialog: in <body>, sichtbar bis zum Ablauf, dann ausgeblendet', () => {
    showToast('Hallo', 1000);
    expect(toast()!.parentElement).toBe(document.body);
    expect(toast()!.textContent).toBe('Hallo');
    expect(toast()!.getAttribute('role')).toBe('status');
    expect(toast()!.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(999);
    expect(toast()!.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(toast()!.classList.contains('show')).toBe(false);
  });

  it('bei offenem modalem Dialog im Dialog (Top Layer), danach wieder in <body>; nur eine Anzeige', () => {
    const list = openDialog();
    const ask = openDialog(); // zuletzt geöffnet = oben
    showToast('Projekt ist nicht lesbar', 3000);
    expect(toast()!.parentElement).toBe(ask);
    ask.remove();
    showToast('Löschen fehlgeschlagen', 3000);
    expect(toast()!.parentElement).toBe(list);
    list.removeAttribute('open');
    showToast('Gespeichert');
    expect(toast()!.parentElement).toBe(document.body);
    expect(document.querySelectorAll('.toast')).toHaveLength(1);
    expect(toast()!.textContent).toBe('Gespeichert');
  });

  it('eine neue Meldung ersetzt die laufende und verlängert die Anzeige', () => {
    showToast('eins', 1000);
    vi.advanceTimersByTime(800);
    showToast('zwei', 1000);
    vi.advanceTimersByTime(800);
    expect(toast()!.textContent).toBe('zwei');
    expect(toast()!.classList.contains('show')).toBe(true);
  });
});
