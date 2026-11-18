import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveApiKey, saveSettings, type ProviderSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { httpError, installFakeFetch, installFakePermissions, openAiReply } from './fake-network';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;
const OPENROUTER: ProviderSettings = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' };

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['https://openrouter.ai/*']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ generator: OPENROUTER });
  await saveApiKey('generator', 'sk-test');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Opens the given tabs (title → URL) and returns their Chrome IDs. */
function open(tabs: Record<string, string>) {
  return Object.fromEntries(Object.entries(tabs).map(([title, url]) => [title, strip.addTab({ url, title })]));
}

const summary = (state: Awaited<ReturnType<Organizer['propose']>>) =>
  state.proposal!.groups.map((g) => ({ name: g.name, provenance: g.provenance, color: g.color, tabs: g.tabs.map((t) => t.title) }));

describe('OpenAI-compatible Generator, full mode', () => {
  it('assigns tabs to categories, open groups and new groups, with provenance and colors', async () => {
    const mine = strip.addTab({ url: 'https://jira.example.com/1', title: 'Ticket' });
    await strip.addGroup('Progetto X', 'cyan', [mine]);
    open({
      'Repo': 'https://github.com/a/b',
      'PR': 'https://github.com/a/b/pull/1',
      'Ricetta': 'https://cucina.it/pasta',
      'Ricetta 2': 'https://cucina.it/pizza',
      'Ticket 2': 'https://jira.example.com/2',
    });
    installFakeFetch(
      openAiReply({
        groups: [
          { name: 'Sviluppo', tabs: ['t1', 't2'] },
          { name: 'Cucina', tabs: ['t3', 't4'] },
          { name: 'progetto x', tabs: ['t5'] },
        ],
      }),
    );

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toEqual([]);
    expect(summary(state)).toEqual([
      { name: 'Sviluppo', provenance: 'list', color: 'grey', tabs: ['Repo', 'PR'] },
      // The first free color: grey belongs to the category Sviluppo, cyan to the open group.
      { name: 'Cucina', provenance: 'ai', color: 'blue', tabs: ['Ricetta', 'Ricetta 2'] },
      { name: 'Progetto X', provenance: 'existing', color: 'cyan', tabs: ['Ticket 2'] },
    ]);
  });

  it('only short IDs, titles and cleaned URLs reach the AI, never the tabs of excluded domains', async () => {
    await saveSettings({ excludedDomains: ['bank.com'] });
    const ids = open({
      'Cerca': 'https://www.google.com/search?q=segreto#risultati',
      'Conto': 'https://online.bank.com/conto?token=abc',
      'Pagina': 'https://user:pass@example.com/',
    });
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    const sent = JSON.parse(requests[0]!.body.messages[1].content);
    expect(sent.tabs).toEqual([
      { id: 't1', title: 'Cerca', url: 'www.google.com/search' },
      { id: 't2', title: 'Pagina', url: 'example.com' },
    ]);
    const raw = JSON.stringify(requests[0]!.body);
    for (const leak of ['segreto', 'risultati', 'bank', 'Conto', 'token=abc', 'abc', 'pass', ...Object.values(ids).map(String)]) {
      expect(raw).not.toContain(leak);
    }
  });

  it('the options are the categories plus the open groups, matched by name', async () => {
    await saveSettings({
      categories: [
        { id: 'a', name: 'Lavoro', description: 'Cose di lavoro', color: 'blue' },
        { id: 'b', name: 'Video', description: 'Video e musica', color: 'red' },
      ],
    });
    const t1 = strip.addTab({ url: 'https://a.com/', title: 'A' });
    const t2 = strip.addTab({ url: 'https://b.com/', title: 'B' });
    await strip.addGroup('LAVORO', 'green', [t1]);
    await strip.addGroup('Mio', 'pink', [t2]);
    open({ 'C': 'https://c.com/' });
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(JSON.parse(requests[0]!.body.messages[1].content).options).toEqual([
      { name: 'LAVORO', description: 'Cose di lavoro' },
      { name: 'Video', description: 'Video e musica' },
      { name: 'Mio', description: 'Gruppo creato dall\'utente: «Mio»' },
    ]);
  });

  it('uses /chat/completions with a JSON schema, Bearer key, model and browser language', async () => {
    open({ 'A': 'https://a.com/' });
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    const [request] = requests;
    expect(request!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(request!.headers.authorization).toBe('Bearer sk-test');
    expect(request!.body.model).toBe('openai/gpt-4o-mini');
    expect(request!.body.response_format.type).toBe('json_schema');
    expect(request!.body.response_format.json_schema.schema.required).toEqual(['groups']);
    expect(request!.body.messages[0].content).toContain('at most 2 words, in italiano');
  });

  it('if the server rejects structured output it retries once without it', async () => {
    open({ 'A1': 'https://a.com/1', 'A2': 'https://a.com/2' });
    const { requests } = installFakeFetch(httpError(400), openAiReply('```json\n{"groups":[{"name":"Lettura","tabs":["t1","t2"]}]}\n```'));

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(2);
    expect(requests[1]!.body.response_format).toBeUndefined();
    expect(summary(state).map((g) => g.name)).toEqual(['Lettura']);
  });

  it('discards nonexistent IDs, duplicate tabs, empty names and names over 2 words', async () => {
    open({ 'A': 'https://a.com/', 'B': 'https://b.com/', 'C': 'https://c.com/', 'D': 'https://d.com/', 'E': 'https://e.com/', 'F': 'https://f.com/' });
    installFakeFetch(
      openAiReply({
        groups: [
          { name: 'Uno', tabs: ['t1', 't2', 't99', 'chrome-123'] },
          { name: 'Due', tabs: ['t2', 't3', 't4'] },
          { name: '   ', tabs: ['t5'] },
          { name: 'Nome troppo lungo', tabs: ['t5', 't6'] },
        ],
      }),
    );

    const state = await organizer.propose(W);

    // t2 is in two groups: it stays free. "Uno" keeps only t1 and does not reach the minimum.
    expect(summary(state).map((g) => [g.name, g.tabs])).toEqual([['Due', ['C', 'D']]]);
  });

  it('applies the minimum to new groups and categories, not to existing groups', async () => {
    await saveSettings({ minTabs: 3 });
    const mine = strip.addTab({ url: 'https://x.com/', title: 'X' });
    await strip.addGroup('Mio', 'red', [mine]);
    open({ 'A': 'https://a.com/', 'B': 'https://b.com/', 'C': 'https://c.com/', 'D': 'https://d.com/', 'E': 'https://e.com/', 'F': 'https://f.com/' });
    installFakeFetch(
      openAiReply({
        groups: [
          { name: 'Notizie', tabs: ['t1', 't2'] },
          { name: 'Ricette', tabs: ['t3', 't4', 't5'] },
          { name: 'Mio', tabs: ['t6'] },
        ],
      }),
    );

    expect(summary(await organizer.propose(W)).map((g) => [g.name, g.provenance, g.tabs.length])).toEqual([
      ['Ricette', 'ai', 3],
      ['Mio', 'existing', 1],
    ]);
  });

  it('"Apply" extends existing groups without changing their name and color; "Undo" restores them as they were', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'X' });
    await strip.addGroup('Mio', 'red', [mine]);
    open({ 'A': 'https://a.com/', 'B': 'https://b.com/', 'C': 'https://c.com/' });
    const before = strip.layout();
    installFakeFetch(openAiReply({ groups: [{ name: 'Mio', tabs: ['t1', 't3'] }, { name: 'Varie', tabs: ['t2'] }] }));

    await organizer.propose(W);
    await organizer.apply();

    expect(strip.groupsIn().map(({ title, color, tabs }) => ({ title, color, tabs }))).toEqual([
      { title: 'Mio', color: 'red', tabs: ['X', 'A', 'C'] },
    ]);
    await organizer.undo();
    expect(strip.layout()).toEqual(before);
    expect(strip.groupsIn().map((g) => [g.title, g.tabs])).toEqual([['Mio', ['X']]]);
  });

  it.each([
    ['server error', () => httpError(500), 'unreachable'],
    ['invalid key', () => httpError(401), 'invalid-key'],
    ['rate limit', () => httpError(429), 'rate-limit'],
    ['network', () => new TypeError('Failed to fetch'), 'unreachable'],
    ['unreadable JSON', () => openAiReply('non è json'), 'invalid-response'],
    ['JSON outside the schema', () => openAiReply({ gruppi: [] }), 'invalid-response'],
  ] as const)('if the Generator fails (%s) the proposal is by domain, with a warning', async (_, reply, cause) => {
    open({ 'A1': 'https://a.com/1', 'A2': 'https://a.com/2' });
    installFakeFetch(reply());

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([{ name: 'a.com', provenance: 'domain', color: 'grey', tabs: ['A1', 'A2'] }]);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'OpenRouter (https://openrouter.ai/api/v1)', cause }]);
  });

  it('without host permission the Generator is not available: no request, proposal by domain and warning', async () => {
    installFakePermissions([]);
    open({ 'A1': 'https://a.com/1', 'A2': 'https://a.com/2' });
    const { fetchMock } = installFakeFetch(openAiReply({ groups: [] }));

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary(state).map((g) => g.provenance)).toEqual(['domain']);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'OpenRouter (https://openrouter.ai/api/v1)', cause: 'no-permission' }]);
  });

  it('the API key is in storage.local and not in storage.sync nor in the state', async () => {
    open({ 'A': 'https://a.com/' });
    installFakeFetch(openAiReply({ groups: [] }));
    await organizer.propose(W);

    expect(await fakeBrowser.storage.local.get('generatorApiKey')).toEqual({ generatorApiKey: 'sk-test' });
    expect(JSON.stringify(await fakeBrowser.storage.sync.get(null))).not.toContain('sk-test');
    expect(JSON.stringify(await fakeBrowser.storage.session.get(null))).not.toContain('sk-test');
  });
});

describe('review AG-R2', () => {
  it('accepts long names when they are those of an open group or a category', async () => {
    await saveSettings({ categories: [{ id: 'c', name: 'Cose da leggere dopo', description: '', color: 'green' }] });
    const mine = strip.addTab({ url: 'https://x.com/', title: 'X' });
    await strip.addGroup('Progetto Cliente Alfa', 'red', [mine]);
    open({ 'A': 'https://a.com/', 'B': 'https://b.com/', 'C': 'https://c.com/' });
    installFakeFetch(
      openAiReply({ groups: [{ name: 'progetto cliente alfa', tabs: ['t1'] }, { name: 'Cose da leggere dopo', tabs: ['t2', 't3'] }] }),
    );

    expect(summary(await organizer.propose(W))).toEqual([
      { name: 'Progetto Cliente Alfa', provenance: 'existing', color: 'red', tabs: ['A'] },
      { name: 'Cose da leggere dopo', provenance: 'list', color: 'green', tabs: ['B', 'C'] },
    ]);
  });
});
