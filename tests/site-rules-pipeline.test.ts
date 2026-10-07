import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveApiKey, saveSettings } from '../src/settings';
import type { Category, OrganizerState } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';
import { HANG, httpError, installFakeFetch, installFakePermissions, openAiReply, systemOneReply, type RecordedRequest } from './fake-network';
import { installFakeScripting } from './fake-scripting';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;
const CATEGORIES: Category[] = [
  { id: 'dev', name: 'Dev', description: 'Programmazione', color: 'grey' },
  { id: 'work', name: 'Work', description: 'Lavoro', color: 'blue' },
  { id: 'google', name: 'Google', description: 'Servizi Google', color: 'green' },
];
const SITES = { dev: ['github.com'], work: ['github.com/mia-org'], google: ['mail.google.com', 'calendar.google.com'] };

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['https://openrouter.ai/*', 'http://127.0.0.1/*']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ mode: 'domain', categories: CATEGORIES, categorySites: SITES });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = (state: OrganizerState) =>
  state.proposal!.groups.map((g) => ({ name: g.name, provenance: g.provenance, color: g.color, tabs: g.tabs.map((t) => t.title) }));

describe('regole sui siti, modalità per sito', () => {
  it('le tab dei siti vanno nella loro categoria, le altre per dominio, con colori distinti', async () => {
    strip.addTab({ url: 'https://mail.google.com/mail/u/0', title: 'Posta' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://calendar.google.com/r', title: 'Calendario' });
    strip.addTab({ url: 'https://news.ycombinator.com/item?id=1', title: 'HN 2' });

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([
      { name: 'Google', provenance: 'list', color: 'green', tabs: ['Posta', 'Calendario'] },
      { name: 'news.ycombinator.com', provenance: 'domain', color: 'grey', tabs: ['HN 1', 'HN 2'] },
    ]);
    expect(state.proposal!.groups[0]!.tabs.map((t) => t.rule)).toEqual(['mail.google.com', 'calendar.google.com']);
    expect(state.proposal!.groups[1]!.tabs.map((t) => t.rule)).toEqual([undefined, undefined]);
  });

  it('vince la regola più specifica', async () => {
    strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/torvalds/linux', title: 'Linux' });
    strip.addTab({ url: 'https://github.com/mia-org/b', title: 'Org B' });
    strip.addTab({ url: 'https://gist.github.com/x', title: 'Gist' });

    expect(summary(await organizer.propose(W))).toEqual([
      { name: 'Work', provenance: 'list', color: 'blue', tabs: ['Org A', 'Org B'] },
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Linux', 'Gist'] },
    ]);
  });

  it('una categoria sotto il minimo non forma il gruppo: la tab resta libera, non va nel gruppo del suo dominio', async () => {
    strip.addTab({ url: 'https://github.com/mia-org/a', title: 'Org A' });
    strip.addTab({ url: 'https://github.com/altro', title: 'Altro' });
    strip.addTab({ url: 'https://github.com/altro2', title: 'Altro 2' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Altro', 'Altro 2'] }]);
  });

  it('un gruppo aperto con il nome della categoria riceve anche una sola tab', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    const open = await strip.addGroup('dev', 'pink', [mine]);
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });

    const { proposal } = await organizer.propose(W);

    expect(proposal!.groups).toMatchObject([{ name: 'dev', color: 'pink', provenance: 'existing', existingGroupId: open, tabs: [{ title: 'Repo' }] }]);
  });

  it('le regole seguono la categoria anche se viene rinominata', async () => {
    await saveSettings({ categories: CATEGORIES.map((c) => (c.id === 'dev' ? { ...c, name: 'Codice' } : c)) });
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });

    expect(summary(await organizer.propose(W))).toEqual([{ name: 'Codice', provenance: 'list', color: 'grey', tabs: ['Repo 1', 'Repo 2'] }]);
  });

  it('una tab spostata dall\'utente perde l\'indicazione della regola', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/2', title: 'HN 2' });
    const { proposal } = await organizer.propose(W);
    const [dev, hn] = proposal!.groups;

    const state = await organizer.edit({ kind: 'move-tab', tabId: dev!.tabs[0]!.tabId, toGroupId: hn!.id });

    expect(state.proposal!.groups.find((g) => g.id === hn!.id)!.tabs.at(-1)).not.toHaveProperty('rule');
  });

  it('cambiare i siti rende non più attuale una proposta salvata', async () => {
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const first = await organizer.propose(W);

    await saveSettings({ categorySites: { dev: ['github.com', 'gitlab.com'] } });
    const second = await organizer.propose(W);

    expect(second.proposal!.signature).not.toBe(first.proposal!.signature);
  });
});

const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' };
const KEV = { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' };

async function aiMode(extra: Parameters<typeof saveSettings>[0] = {}) {
  await saveSettings({ mode: 'ai', generator: OPENROUTER, ...extra });
  await saveApiKey('generator', 'sk-test');
}

/** Titoli delle tab inviate al Generatore in una richiesta. */
const sentTitles = (request: RecordedRequest) => JSON.parse(request.body.messages[1].content).tabs.map((t: { title: string }) => t.title);

describe('regole sui siti, modalità AI', () => {
  it('all\'AI arrivano solo le tab che nessuna regola ha preso; i gruppi con lo stesso nome si uniscono', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://stackoverflow.com/q/1', title: 'Domanda' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch(openAiReply({ groups: [{ name: 'Dev', tabs: ['t2'] }, { name: 'Cucina', tabs: ['t3', 't4'] }] }));

    const state = await organizer.propose(W);

    expect(sentTitles(requests[0]!)).toEqual(['Domanda', 'Pasta', 'Pizza']);
    expect(summary(state)).toEqual([
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo', 'Domanda'] },
      { name: 'Cucina', provenance: 'ai', color: 'blue', tabs: ['Pasta', 'Pizza'] },
    ]);
  });

  it('ignora l\'ID di una tab delle regole se l\'AI lo usa comunque', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    installFakeFetch(openAiReply({ groups: [{ name: 'Cucina', tabs: ['t1', 't2', 't3'] }] }));

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([{ name: 'Cucina', provenance: 'ai', color: 'grey', tabs: ['Pasta', 'Pizza'] }]);
  });

  it('se tutte le tab sono prese dalle regole non interroga l\'AI e non mostra l\'anteprima', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    const { fetchMock } = installFakeFetch(new Error('nessuna richiesta attesa'));
    const announced: OrganizerState[] = [];
    organizer = createOrganizer({ onStateChange: (s) => announced.push(s) });

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(announced.some((s) => s.preview)).toBe(false);
    expect(state.proposal!.warnings).toEqual([]);
    expect(summary(state)).toEqual([{ name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo 1', 'Repo 2'] }]);
  });

  it('l\'anteprima per sito contiene già i gruppi delle regole, e "Usa questa" li tiene', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch(HANG);
    const announced: OrganizerState[] = [];
    organizer = createOrganizer({ onStateChange: (s) => announced.push(s) });

    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const names = announced.at(-1)!.preview!.groups.map((g) => g.name);
    await organizer.acceptPreview();
    const state = await running;

    expect(names).toEqual(['Dev', 'cucina.it']);
    expect(state.proposal!.groups.map((g) => g.name)).toEqual(['Dev', 'cucina.it']);
  });

  it('se l\'AI non risponde il ripiego è regole + dominio', async () => {
    await aiMode();
    strip.addTab({ url: 'https://github.com/a', title: 'Repo 1' });
    strip.addTab({ url: 'https://github.com/b', title: 'Repo 2' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    installFakeFetch(httpError(401));

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'invalid-key' }]);
    expect(state.proposal!.groups.map((g) => [g.name, g.provenance])).toEqual([
      ['Dev', 'list'],
      ['cucina.it', 'domain'],
    ]);
  });

  it('Classificatore: le tab delle regole contano per il minimo e non vanno mai al Generatore', async () => {
    await aiMode({ classifier: KEV });
    strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    strip.addTab({ url: 'https://stackoverflow.com/q/1', title: 'Domanda' });
    strip.addTab({ url: 'https://github.com/mia-org/x', title: 'Org' });
    strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    strip.addTab({ url: 'https://cucina.it/pizza', title: 'Pizza' });
    const { requests } = installFakeFetch((request: RecordedRequest) => {
      if (request.url.endsWith('/v1/systemone')) {
        const choice = request.body.state.title === 'Domanda' ? 'Dev' : 'none_of_the_above';
        return systemOneReply({ group: { choice, confidence: 0.9 } });
      }
      const tabs = JSON.parse(request.body.messages[1].content).tabs as { id: string }[];
      return openAiReply({ groups: [{ name: 'Cucina', tabs: tabs.map((t) => t.id) }] });
    });

    const state = await organizer.propose(W);

    const classified = requests.filter((r) => r.url.endsWith('/v1/systemone')).map((r) => r.body.state.title);
    expect(classified.sort()).toEqual(['Domanda', 'Pasta', 'Pizza']);
    const generated = requests.filter((r) => !r.url.endsWith('/v1/systemone')).flatMap(sentTitles);
    expect(generated).toEqual(['Pasta', 'Pizza']);
    // "Org" (Work) resta sotto il minimo: libera, non passata al Generatore.
    expect(summary(state)).toEqual([
      { name: 'Dev', provenance: 'list', color: 'grey', tabs: ['Repo', 'Domanda'] },
      { name: 'Cucina', provenance: 'ai', color: 'blue', tabs: ['Pasta', 'Pizza'] },
    ]);
  });

  it('non legge la descrizione delle pagine prese dalle regole', async () => {
    installFakePermissions(['https://openrouter.ai/*', '<all_urls>']);
    await aiMode({ readDescriptions: true });
    const repo = strip.addTab({ url: 'https://github.com/a', title: 'Repo' });
    const pasta = strip.addTab({ url: 'https://cucina.it/pasta', title: 'Pasta' });
    const { read } = installFakeScripting(new Map([[repo, { description: 'R' }], [pasta, { description: 'P' }]]));
    installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(read).toEqual([pasta]);
  });
});
