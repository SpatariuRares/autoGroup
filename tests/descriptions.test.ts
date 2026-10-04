import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { installFakeFetch, installFakePermissions, openAiReply, systemOneReply, type RecordedRequest } from './fake-network';
import { installFakeScripting, type FakePage } from './fake-scripting';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
let pages: Map<number, FakePage>;
const W = 1;
const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' };

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['https://openrouter.ai/*', 'http://127.0.0.1/*', '<all_urls>']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  pages = new Map();
  await saveSettings({ generator: OPENROUTER, readDescriptions: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Apre una tab con la sua pagina finta. */
function open(title: string, url: string, page: FakePage = { description: `Descrizione di ${title}` }, extra: { discarded?: boolean } = {}) {
  const id = strip.addTab({ url, title, ...extra });
  pages.set(id, page);
  return id;
}

/** Tab inviate al Generatore nell'ultima richiesta. */
function sentTabs(requests: RecordedRequest[]) {
  return JSON.parse(requests.at(-1)!.body.messages[1].content).tabs;
}

describe('descrizione delle pagine', () => {
  it('con l\'opzione accesa e il permesso concesso la descrizione arriva al Generatore', async () => {
    open('A', 'https://a.com/');
    open('B', 'https://b.com/', { description: '  Una   descrizione\nsu più righe  ' });
    open('C', 'https://c.com/', { description: null });
    const { read } = installFakeScripting(pages);
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).toHaveLength(3);
    expect(sentTabs(requests)).toEqual([
      { id: 't1', title: 'A', url: 'a.com', description: 'Descrizione di A' },
      { id: 't2', title: 'B', url: 'b.com', description: 'Una descrizione su più righe' },
      { id: 't3', title: 'C', url: 'c.com' },
    ]);
  });

  it('la descrizione arriva anche al Classificatore, nello state', async () => {
    await saveSettings({ classifier: { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' } });
    open('A', 'https://a.com/');
    installFakeScripting(pages);
    const { requests } = installFakeFetch(systemOneReply({ group: { choice: 'none_of_the_above', confidence: 0.9 } }));

    await organizer.propose(W);

    expect(requests[0]!.body.state).toEqual({ title: 'A', url: 'a.com', description: 'Descrizione di A' });
  });

  it('senza il permesso <all_urls> non legge nessuna pagina: solo titolo e URL', async () => {
    installFakePermissions(['https://openrouter.ai/*']);
    open('A', 'https://a.com/');
    const { read } = installFakeScripting(pages);
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).toEqual([]);
    expect(sentTabs(requests)).toEqual([{ id: 't1', title: 'A', url: 'a.com' }]);
  });

  it('con l\'opzione spenta non legge nessuna pagina, anche con il permesso', async () => {
    await saveSettings({ readDescriptions: false });
    open('A', 'https://a.com/');
    const { read } = installFakeScripting(pages);
    installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).toEqual([]);
  });

  it('non legge né risveglia le tab sospese da Risparmio memoria', async () => {
    open('Attiva', 'https://a.com/');
    const sleeping = open('Sospesa', 'https://b.com/', undefined, { discarded: true });
    const { read } = installFakeScripting(pages);
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).not.toContain(sleeping);
    expect(sentTabs(requests)[1]).toEqual({ id: 't2', title: 'Sospesa', url: 'b.com' });
  });

  it('se una pagina non risponde entro ~500 ms usa solo titolo e URL per quella tab', async () => {
    open('Veloce', 'https://a.com/');
    open('Lenta', 'https://b.com/', { description: 'mai', delay: Infinity });
    installFakeScripting(pages);
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    const started = Date.now();
    await organizer.propose(W);

    expect(Date.now() - started).toBeLessThan(1500);
    expect(sentTabs(requests)).toEqual([
      { id: 't1', title: 'Veloce', url: 'a.com', description: 'Descrizione di Veloce' },
      { id: 't2', title: 'Lenta', url: 'b.com' },
    ]);
  });

  it('salta Web Store e PDF; una pagina non accessibile non blocca le altre', async () => {
    open('Store', 'https://chromewebstore.google.com/detail/x');
    open('Store vecchio', 'https://chrome.google.com/webstore/detail/x');
    open('Documento', 'https://a.com/file.PDF');
    const blocked = strip.addTab({ url: 'https://b.com/', title: 'Bloccata' }); // nessuna pagina: executeScript fallisce
    open('Normale', 'https://c.com/');
    const { read } = installFakeScripting(pages);
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).toEqual([blocked, read.at(-1)]);
    expect(sentTabs(requests).filter((t: { description?: string }) => t.description).map((t: { title: string }) => t.title)).toEqual(['Normale']);
  });

  it('non legge mai le tab dei domini esclusi', async () => {
    await saveSettings({ excludedDomains: ['bank.com'] });
    const bank = open('Conto', 'https://online.bank.com/');
    open('A', 'https://a.com/');
    const { read } = installFakeScripting(pages);
    installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).not.toContain(bank);
  });

  it('senza AI (raggruppamento per dominio) non legge nessuna pagina', async () => {
    await saveSettings({ generator: { preset: 'none', baseUrl: '', model: '' } });
    open('A1', 'https://a.com/1');
    open('A2', 'https://a.com/2');
    const { read } = installFakeScripting(pages);

    const state = await organizer.propose(W);

    expect(read).toEqual([]);
    expect(state.proposal!.groups.map((g) => g.provenance)).toEqual(['domain']);
  });
});
