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

/** Apre le tab indicate (titolo → URL) e restituisce gli ID di Chrome. */
function open(tabs: Record<string, string>) {
  return Object.fromEntries(Object.entries(tabs).map(([title, url]) => [title, strip.addTab({ url, title })]));
}

const summary = (state: Awaited<ReturnType<Organizer['propose']>>) =>
  state.proposal!.groups.map((g) => ({ name: g.name, provenance: g.provenance, color: g.color, tabs: g.tabs.map((t) => t.title) }));

describe('Generatore compatibile OpenAI, modalità completo', () => {
  it('assegna le tab a categorie, gruppi aperti e gruppi nuovi, con provenienza e colori', async () => {
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
      // Il primo colore libero: grigio è della categoria Sviluppo, ciano del gruppo aperto.
      { name: 'Cucina', provenance: 'ai', color: 'blue', tabs: ['Ricetta', 'Ricetta 2'] },
      { name: 'Progetto X', provenance: 'existing', color: 'cyan', tabs: ['Ticket 2'] },
    ]);
  });

  it('all\'AI arrivano solo ID brevi, titoli e URL ripuliti, mai le tab dei domini esclusi', async () => {
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
    for (const leak of ['segreto', 'risultati', 'bank', 'Conto', 'token', 'pass', ...Object.values(ids).map(String)]) {
      expect(raw).not.toContain(leak);
    }
  });

  it('le opzioni sono le categorie più i gruppi aperti, con corrispondenza per nome', async () => {
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

  it('usa /chat/completions con schema JSON, chiave Bearer, modello e lingua del browser', async () => {
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

  it('se il server rifiuta lo structured output ritenta una volta senza', async () => {
    open({ 'A1': 'https://a.com/1', 'A2': 'https://a.com/2' });
    const { requests } = installFakeFetch(httpError(400), openAiReply('```json\n{"groups":[{"name":"Lettura","tabs":["t1","t2"]}]}\n```'));

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(2);
    expect(requests[1]!.body.response_format).toBeUndefined();
    expect(summary(state).map((g) => g.name)).toEqual(['Lettura']);
  });

  it('scarta ID inesistenti, tab duplicate, nomi vuoti e nomi oltre le 2 parole', async () => {
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

    // t2 è in due gruppi: resta libera. "Uno" rimane con la sola t1 e non raggiunge il minimo.
    expect(summary(state).map((g) => [g.name, g.tabs])).toEqual([['Due', ['C', 'D']]]);
  });

  it('applica il minimo ai gruppi nuovi e alle categorie, non ai gruppi esistenti', async () => {
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

  it('"Applica" estende i gruppi esistenti senza cambiarne nome e colore; "Annulla" li riporta com\'erano', async () => {
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
    ['errore del server', () => httpError(500), 'unreachable'],
    ['chiave non valida', () => httpError(401), 'invalid-key'],
    ['limite di richieste', () => httpError(429), 'rate-limit'],
    ['rete', () => new TypeError('Failed to fetch'), 'unreachable'],
    ['JSON illeggibile', () => openAiReply('non è json'), 'invalid-response'],
    ['JSON fuori schema', () => openAiReply({ gruppi: [] }), 'invalid-response'],
  ] as const)('se il Generatore fallisce (%s) la proposta è per dominio, con un avviso', async (_, reply, cause) => {
    open({ 'A1': 'https://a.com/1', 'A2': 'https://a.com/2' });
    installFakeFetch(reply());

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([{ name: 'a.com', provenance: 'domain', color: 'grey', tabs: ['A1', 'A2'] }]);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'OpenRouter (openrouter.ai)', cause }]);
  });

  it('senza il permesso host il Generatore non è disponibile: nessuna richiesta, proposta per dominio e avviso', async () => {
    installFakePermissions([]);
    open({ 'A1': 'https://a.com/1', 'A2': 'https://a.com/2' });
    const { fetchMock } = installFakeFetch(openAiReply({ groups: [] }));

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary(state).map((g) => g.provenance)).toEqual(['domain']);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'OpenRouter (openrouter.ai)', cause: 'no-permission' }]);
  });

  it('la chiave API sta in storage.local e non in storage.sync né nello stato', async () => {
    open({ 'A': 'https://a.com/' });
    installFakeFetch(openAiReply({ groups: [] }));
    await organizer.propose(W);

    expect(await fakeBrowser.storage.local.get('generatorApiKey')).toEqual({ generatorApiKey: 'sk-test' });
    expect(JSON.stringify(await fakeBrowser.storage.sync.get(null))).not.toContain('sk-test');
    expect(JSON.stringify(await fakeBrowser.storage.session.get(null))).not.toContain('sk-test');
  });
});

describe('review AG-R2', () => {
  it('accetta i nomi lunghi quando sono quelli di un gruppo aperto o di una categoria', async () => {
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
