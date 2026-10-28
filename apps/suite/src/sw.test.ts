import { describe, it, expect } from 'vitest';
import swTemplate from '../public/sw.js?raw';

// Führt public/sw.js mit nachgebildetem self/caches/fetch aus (wie der Build: CACHE ersetzt).
const ORIGIN = 'https://example.test';
const BASE = `${ORIGIN}/app/`;
const abs = (r: string | { url: string }) => new URL(typeof r === 'string' ? r : r.url, BASE).href;

class FakeCache {
  entries = new Map<string, Response>();
  constructor(private net: (url: string) => Promise<Response>) {}
  async match(r: string | { url: string }) { return this.entries.get(abs(r))?.clone(); }
  async put(r: string | { url: string }, res: Response) { this.entries.set(abs(r), res); }
  async addAll(urls: string[]) { for (const u of urls) this.entries.set(abs(u), await this.net(abs(u))); }
}

function setup(cacheName: string, network: Record<string, string> | 'offline') {
  const net = async (url: string) => {
    if (network === 'offline') throw new TypeError('offline');
    const body = network[url];
    return body === undefined ? new Response('nf', { status: 404 }) : new Response(body, { status: 200 });
  };
  const store = new Map<string, FakeCache>();
  const caches = {
    async open(name: string) { if (!store.has(name)) store.set(name, new FakeCache(net)); return store.get(name)!; },
    async keys() { return [...store.keys()]; },
    async delete(name: string) { return store.delete(name); },
    // Darf der Service Worker nicht benutzen (würde auch fremde/alte Caches durchsuchen)
    async match() { throw new Error('globales caches.match benutzt'); },
  };
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    addEventListener: (t: string, h: (e: unknown) => void) => { handlers[t] = h; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: { scope: BASE },
  };
  const fetchFn = (r: string | { url: string }) => net(abs(r));
  const code = swTemplate.replace(/const CACHE = '[^']*';/, `const CACHE = '${cacheName}';`);
  new Function('self', 'caches', 'fetch', 'location', code)(self, caches, fetchFn, { origin: ORIGIN });

  async function dispatch(type: string, extra: object = {}): Promise<Response | undefined> {
    let waited: Promise<unknown> | undefined;
    let responded: Promise<Response> | undefined;
    handlers[type]({ ...extra, waitUntil: (p: Promise<unknown>) => { waited = p; }, respondWith: (p: Promise<Response>) => { responded = p; } });
    await waited;
    return responded ? await responded : undefined;
  }
  const request = (url: string, mode = 'no-cors') => ({ url: abs(url), method: 'GET', mode });
  return { store, caches, dispatch, request };
}

describe('Service Worker', () => {
  const online = { [BASE]: '<script src="./assets/index-NEU.js"></script>', [`${BASE}assets/index-NEU.js`]: 'neu' };

  it('liest nur aus dem eigenen Cache, nie aus einem alten pixelart-Cache', async () => {
    const sw = setup('pixelart-klexel-v7', online);
    // alter Cache mit veraltetem index und veralteter Datei liegt daneben
    const old = await sw.caches.open('pixelart-v7');
    await old.put('./', new Response('ALT'));
    await old.put('./assets/index-NEU.js', new Response('ALT'));
    await sw.dispatch('install');
    expect([...(await sw.caches.open('pixelart-klexel-v7')).entries.keys()]).toContain(`${BASE}assets/index-NEU.js`);

    const offline = setup('pixelart-klexel-v7', 'offline');
    // Zustand übernehmen: beide Caches, aber jetzt offline
    for (const [k, v] of sw.store) offline.store.set(k, v);
    const page = await offline.dispatch('fetch', { request: offline.request('./', 'navigate') });
    expect(await page!.text()).toContain('index-NEU.js');
    const js = await offline.dispatch('fetch', { request: offline.request('./assets/index-NEU.js') });
    expect(await js!.text()).toBe('neu');
  });

  it('Seite: Netz zuerst und frisch in den eigenen Cache; offline aus dem Cache', async () => {
    const sw = setup('pixelart-v7', online);
    await sw.dispatch('install');
    const fresh = { ...online, [BASE]: 'NEUER INDEX' };
    const on = setup('pixelart-v7', fresh);
    for (const [k, v] of sw.store) on.store.set(k, v);
    expect(await (await on.dispatch('fetch', { request: on.request('./', 'navigate') }))!.text()).toBe('NEUER INDEX');
    await new Promise(r => setTimeout(r, 0)); // Nachcachen läuft im Hintergrund
    const off = setup('pixelart-v7', 'offline');
    for (const [k, v] of on.store) off.store.set(k, v);
    expect(await (await off.dispatch('fetch', { request: off.request('./', 'navigate') }))!.text()).toBe('NEUER INDEX');
    // Unbekannte Seite offline → App-Seite als Rückfall
    expect(await (await off.dispatch('fetch', { request: off.request('./irgendwo', 'navigate') }))!.text()).toBe('NEUER INDEX');
  });

  it('Aktivieren löscht alte pixelart-Caches, aber keine fremden', async () => {
    const sw = setup('pixelart-klexel-v7', online);
    for (const n of ['pixelart-v5', 'pixelart-v6', 'pixelart-klexel-v6', 'pixelart-v7', 'pixelart-rigsprite-v7', 'pixelart-klexel-v7', 'andere-app-v1']) await sw.caches.open(n);
    await sw.dispatch('activate');
    expect((await sw.caches.keys()).sort()).toEqual(['andere-app-v1', 'pixelart-klexel-v7']);
  });

  it('Vorlage enthält die Platzhalter, die der Build ersetzt', () => {
    expect(swTemplate).toMatch(/const CACHE = 'pixelart-v7';/);
    expect(swTemplate).toContain('const BUILD_ASSETS = [];');
    expect(swTemplate).not.toMatch(/caches\.match\(/);
  });
});
