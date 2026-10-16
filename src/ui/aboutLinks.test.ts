import { describe, it, expect } from 'vitest';
import { linkAction } from './aboutLinks';

describe('linkAction', () => {
  it('öffnet gültige https- und http-Links bei bestehender Verbindung', () => {
    expect(linkAction('https://ko-fi.com/klexel', true)).toBe('open');
    expect(linkAction('http://example.org/x', true)).toBe('open');
  });

  it('meldet "offline" für gültige Links ohne Verbindung', () => {
    expect(linkAction('https://ko-fi.com/klexel', false)).toBe('offline');
  });

  it('behandelt leere oder nur aus Leerzeichen bestehende Links als Platzhalter', () => {
    expect(linkAction('', true)).toBe('placeholder');
    expect(linkAction('   ', true)).toBe('placeholder');
    expect(linkAction('', false)).toBe('placeholder');
  });

  it('akzeptiert nur http(s): andere Schemata sind Platzhalter', () => {
    expect(linkAction('javascript:alert(1)', true)).toBe('placeholder');
    expect(linkAction('data:text/html,<b>x</b>', true)).toBe('placeholder');
    expect(linkAction('mailto:a@b.c', true)).toBe('placeholder');
    expect(linkAction('ftp://example.org', true)).toBe('placeholder');
    expect(linkAction('ko-fi.com/klexel', true)).toBe('placeholder');
  });

  it('ignoriert führende und nachfolgende Leerzeichen und die Groß-/Kleinschreibung des Schemas', () => {
    expect(linkAction('  https://example.org  ', true)).toBe('open');
    expect(linkAction('HTTPS://example.org', true)).toBe('open');
  });
});
