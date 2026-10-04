import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { GENERATE_MAX_TOKENS } from '../src/ai/openai-generator';
import { createOrganizer, type Organizer } from '../src/organizer';
import { createSessionCache } from '../src/organizer/session-cache';
import { saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { installFakeNano } from './fake-nano';
import { httpError, installFakeFetch, installFakePermissions, openAiReply, systemOneReply, type RecordedRequest } from './fake-network';
import { installFakeScripting, type FakePage } from './fake-scripting';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;
const KEV = { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' };
const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' };
const CATEGORIES = [
  { id: 'w', name: 'Lavoro', description: 'Email e documenti di lavoro', color: 'blue' as const },
  { id: 'n', name: 'Notizie', description: 'Giornali', color: 'red' as const },
];

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['http://127.0.0.1/*', 'https://openrouter.ai/*', '<all_urls>']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = (state: Awaited<ReturnType<Organizer['propose']>>) =>
  state.proposal!.groups.map((g) => [g.name, g.provenance, g.tabs.map((t) => t.title)]);
const recompute = () => organizer.propose(W, { force: true });
const systemOne = (requests: RecordedRequest[]) => requests.filter((r) => r.url.endsWith('/v1/systemone'));

/** System One finto: la scelta dipende dal titolo della tab; "Illeggibile" riceve una risposta senza confidenza. */
function classifierServer(verdicts: Record<string, [string, number]>) {
  return installFakeFetch((request: RecordedRequest) => {
    if (!request.url.endsWith('/v1/systemone')) return new Error('Generatore inatteso');
    if (request.body.state.title === 'Illeggibile') return new Response(JSON.stringify({ answers: { group: { type: 'choice' } } }), { status: 200 });
    const [choice, confidence] = verdicts[request.body.state.title] ?? ['none_of_the_above', 0.9];
    return systemOneReply({ group: { choice, confidence } });
  });
}

describe('cache dei risultati del Classificatore', () => {
  const VERDICTS: Record<string, [string, number]> = {
    Posta: ['Lavoro', 0.95],
    Documento: ['Lavoro', 0.9],
    Giornale: ['Notizie', 0.95],
    Quotidiano: ['Notizie', 0.6],
    Agenda: ['Lavoro', 0.95],
  };

  beforeEach(async () => {
    await saveSettings({ classifier: KEV, generator: { preset: 'none', baseUrl: '', model: '' }, categories: CATEGORIES });
    for (const title of ['Posta', 'Documento', 'Giornale', 'Quotidiano']) strip.addTab({ url: `https://${title.toLowerCase()}.com/`, title });
  });

  it('aprendo una tab si classifica solo quella, con lo stesso risultato di un calcolo da zero', async () => {
    const { requests } = classifierServer(VERDICTS);
    await organizer.propose(W);
    expect(systemOne(requests)).toHaveLength(4);

    strip.addTab({ url: 'https://agenda.com/', title: 'Agenda' });
    const state = await organizer.propose(W);

    expect(systemOne(requests)).toHaveLength(5);
    expect(systemOne(requests).at(-1)!.body.state.title).toBe('Agenda');
    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento', 'Agenda']]]);
  });

  it('"Ricalcola" e il cambio di soglia non rifanno nessuna richiesta', async () => {
    const { requests } = classifierServer(VERDICTS);
    await organizer.propose(W);

    await recompute();
    await saveSettings({ threshold: 0.5 });
    const state = await organizer.propose(W);

    expect(systemOne(requests)).toHaveLength(4);
    // Con la soglia a 0,5 anche "Quotidiano" (0,6) entra in Notizie.
    expect(summary(state)).toEqual([
      ['Lavoro', 'list', ['Posta', 'Documento']],
      ['Notizie', 'list', ['Giornale', 'Quotidiano']],
    ]);
  });

  it('cambiare la descrizione di una categoria o il modello riclassifica tutte le tab', async () => {
    const { requests } = classifierServer(VERDICTS);
    await organizer.propose(W);

    await saveSettings({ categories: [{ ...CATEGORIES[0]!, description: 'Altro' }, CATEGORIES[1]!] });
    await organizer.propose(W);
    expect(systemOne(requests)).toHaveLength(8);

    await saveSettings({ classifier: { ...KEV, model: 'kev-2' } });
    await organizer.propose(W);
    expect(systemOne(requests)).toHaveLength(12);
  });

  it('una risposta illeggibile non viene ricordata: al calcolo dopo si richiede', async () => {
    strip.addTab({ url: 'https://strano.com/', title: 'Illeggibile' });
    const { requests } = classifierServer(VERDICTS);
    await organizer.propose(W);

    await recompute();

    expect(systemOne(requests).map((r) => r.body.state.title).slice(5)).toEqual(['Illeggibile']);
  });

  it('se il Classificatore fallisce non si ricorda nulla e si scende al livello dopo', async () => {
    const { requests } = installFakeFetch(httpError(401));
    const state = await organizer.propose(W);
    expect(state.proposal!.warnings).toMatchObject([{ level: 'classifier', cause: 'invalid-key' }]);

    expect(requests.length).toBeGreaterThan(0);
    const second = classifierServer(VERDICTS);
    const retry = await recompute();
    expect(retry.proposal!.warnings).toEqual([]);
    expect(systemOne(second.requests)).toHaveLength(4);
  });
});

describe('cache delle descrizioni', () => {
  let pages: Map<number, FakePage>;

  beforeEach(async () => {
    await saveSettings({ generator: OPENROUTER, readDescriptions: true });
    pages = new Map();
  });

  function open(title: string, url: string, page: FakePage = { description: `Descrizione di ${title}` }, extra: { discarded?: boolean } = {}) {
    const id = strip.addTab({ url, title, ...extra });
    pages.set(id, page);
    return id;
  }

  const sentTabs = (requests: RecordedRequest[]) => JSON.parse(requests.at(-1)!.body.messages[1].content).tabs;

  it('un nuovo calcolo legge solo le pagine nuove, e le descrizioni lette arrivano ancora all\'AI', async () => {
    open('A', 'https://a.com/');
    open('B', 'https://b.com/', { description: null });
    const { read } = installFakeScripting(pages);
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));
    await organizer.propose(W);
    expect(read).toHaveLength(2);

    const c = open('C', 'https://c.com/');
    await organizer.propose(W);

    expect(read.slice(2)).toEqual([c]);
    expect(sentTabs(requests)).toEqual([
      { id: 't1', title: 'A', url: 'a.com', description: 'Descrizione di A' },
      { id: 't2', title: 'B', url: 'b.com' },
      { id: 't3', title: 'C', url: 'c.com', description: 'Descrizione di C' },
    ]);
  });

  it('una pagina che non ha risposto in tempo si riprova al calcolo dopo', async () => {
    const slow = open('Lenta', 'https://lenta.com/', { description: 'Tardi', delay: Infinity });
    const { read } = installFakeScripting(pages);
    installFakeFetch(openAiReply({ groups: [] }));
    await organizer.propose(W);

    await recompute();

    expect(read).toEqual([slow, slow]);
  });

  it('una pagina non accessibile si riprova al calcolo dopo', async () => {
    const denied = strip.addTab({ url: 'https://negata.com/', title: 'Negata' });
    const { read } = installFakeScripting(pages);
    installFakeFetch(openAiReply({ groups: [] }));
    await organizer.propose(W);

    await recompute();

    expect(read).toEqual([denied, denied]);
  });

  it('una tab sospesa ritrova la descrizione già letta per lo stesso URL, senza essere letta', async () => {
    open('Attiva', 'https://x.com/pagina');
    const { read } = installFakeScripting(pages);
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));
    await organizer.propose(W);

    const sleeping = open('Sospesa', 'https://x.com/pagina', { description: 'Mai letta' }, { discarded: true });
    await organizer.propose(W);

    expect(read).not.toContain(sleeping);
    expect(sentTabs(requests)[1]).toEqual({ id: 't2', title: 'Sospesa', url: 'x.com/pagina', description: 'Descrizione di Attiva' });
  });
});

describe('cache in storage.session', () => {
  it('oltre il limite escono le voci più vecchie; una voce riscritta torna la più recente', async () => {
    const cache = createSessionCache<number>('test', 2);
    await cache.setMany(new Map([['a', 1], ['b', 2]]));
    await cache.setMany(new Map([['a', 10]]));
    await cache.setMany(new Map([['c', 3]]));

    expect(await cache.getMany(['a', 'b', 'c'])).toEqual(new Map([['a', 10], ['c', 3]]));
  });
});

describe('Generatore compatibile OpenAI: tempi limitati e richieste leggere', () => {
  beforeEach(async () => {
    await saveSettings({ generator: OPENROUTER, categories: CATEGORIES });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
  });

  it('chiede al massimo GENERATE_MAX_TOKENS token', async () => {
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(requests[0]!.body.max_tokens).toBe(GENERATE_MAX_TOKENS);
  });

  it('una risposta tagliata dal tetto diventa "risposta non valida" e si scende al dominio', async () => {
    const truncated = new Response(JSON.stringify({ choices: [{ message: { content: '{"groups":[{"name":"Let' }, finish_reason: 'length' }] }), { status: 200 });
    installFakeFetch(truncated);

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'invalid-response' }]);
    expect(summary(state)).toEqual([['a.com', 'domain', ['A1', 'A2']]]);
  });

  it('dopo un 400 ritenta una volta con la richiesta minima, senza schema né tetto', async () => {
    const { requests } = installFakeFetch(httpError(400), openAiReply({ groups: [{ name: 'Lavoro', tabs: ['t1', 't2'] }] }));

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(2);
    expect(requests[1]!.body).not.toHaveProperty('max_tokens');
    expect(requests[1]!.body).not.toHaveProperty('response_format');
    expect(summary(state)).toEqual([['Lavoro', 'list', ['A1', 'A2']]]);
  });

  it('in modalità "solo nuovi" le opzioni arrivano solo per nome; in "completo" con la descrizione', async () => {
    await saveSettings({ classifier: KEV });
    const { requests } = installFakeFetch((request: RecordedRequest) =>
      request.url.endsWith('/v1/systemone') ? systemOneReply({ group: { choice: 'none_of_the_above', confidence: 0.9 } }) : openAiReply({ groups: [] }),
    );

    await organizer.propose(W);
    const newOnly = requests.find((r) => r.url.endsWith('/chat/completions'))!;
    expect(JSON.parse(newOnly.body.messages[1].content).options).toEqual(['Lavoro', 'Notizie']);

    await saveSettings({ classifier: { preset: 'none', baseUrl: '', model: '' } });
    await organizer.propose(W);
    expect(JSON.parse(requests.at(-1)!.body.messages[1].content).options).toEqual([
      { name: 'Lavoro', description: 'Email e documenti di lavoro' },
      { name: 'Notizie', description: 'Giornali' },
    ]);
  });
});

describe('Gemini Nano: sessione pronta prima e riusata', () => {
  beforeEach(() => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
  });

  const twoTabs = () => ({ groups: [{ name: 'Lettura', tabs: ['t1', 't2'] }] });

  it('la sessione con il prompt di sistema viene creata una volta e riusata dai calcoli successivi', async () => {
    const nano = installFakeNano({ availability: 'available', respond: twoTabs });

    await organizer.propose(W);
    const again = await recompute();

    expect(nano.created.count).toBe(1);
    expect(nano.calls).toHaveLength(2);
    expect(summary(again)).toEqual([['Lettura', 'ai', ['A1', 'A2']]]);
  });

  it('con il Classificatore, Nano crea la sessione mentre il Classificatore lavora', async () => {
    await saveSettings({ classifier: KEV, categories: CATEGORIES });
    const nano = installFakeNano({ availability: 'available', respond: twoTabs });
    const createdDuringClassification: number[] = [];
    installFakeFetch(() => {
      createdDuringClassification.push(nano.created.count);
      return systemOneReply({ group: { choice: 'none_of_the_above', confidence: 0.9 } });
    });

    const state = await organizer.propose(W);

    expect(createdDuringClassification).toEqual([1, 1]);
    expect(summary(state)).toEqual([['Lettura', 'ai', ['A1', 'A2']]]);
  });

  it('una creazione fallita non viene riusata: il calcolo dopo ne crea una nuova', async () => {
    installFakeNano({ availability: 'available', respond: twoTabs });
    (LanguageModel.create as unknown as Mock).mockRejectedValueOnce(new Error('GPU occupata'));

    const failed = await organizer.propose(W);
    expect(failed.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'unavailable' }]);

    const retry = await recompute();
    expect(retry.proposal!.warnings).toEqual([]);
    expect(summary(retry)).toEqual([['Lettura', 'ai', ['A1', 'A2']]]);
  });

  it('se la creazione avviata in anticipo fallisce, il Generatore ne crea una nuova invece di riusarla', async () => {
    await saveSettings({ classifier: KEV, categories: CATEGORIES });
    installFakeNano({ availability: 'available', respond: twoTabs });
    (LanguageModel.create as unknown as Mock).mockRejectedValueOnce(new Error('GPU occupata'));
    installFakeFetch(async () => {
      // Il Classificatore risponde dopo che la creazione anticipata è già fallita.
      await new Promise((r) => setTimeout(r, 5));
      return systemOneReply({ group: { choice: 'none_of_the_above', confidence: 0.9 } });
    });

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toEqual([]);
    expect(summary(state)).toEqual([['Lettura', 'ai', ['A1', 'A2']]]);
  });

  it('una sessione che smette di funzionare (es. distrutta da Chrome) viene ricreata al calcolo dopo', async () => {
    const nano = installFakeNano({ availability: 'available', respond: twoTabs, cloneError: new Error('session destroyed') });

    const failed = await organizer.propose(W);
    expect(failed.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'invalid-request' }]);

    await recompute();
    expect(nano.created.count).toBe(2);
  });
});
