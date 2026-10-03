import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createSystemOneClassifier } from '../src/ai/systemone-classifier';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveApiKey, saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { httpError, installFakeFetch, installFakePermissions, openAiReply, systemOneReply, type RecordedRequest } from './fake-network';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;

const KEV = { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' };
const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' };

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['http://127.0.0.1/*', 'https://openrouter.ai/*']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({
    classifier: KEV,
    categories: [
      { id: 'w', name: 'Lavoro', description: 'Email e documenti di lavoro', color: 'blue' },
      { id: 'n', name: 'Notizie', description: 'Giornali', color: 'red' },
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Classificazione decisa dal titolo della tab: "titolo" → [scelta, confidenza]. */
type Verdicts = Record<string, [string, number]>;

/** Server finto: System One risponde secondo `verdicts`, il Generatore con `generator(tab rimaste)`. */
function servers(verdicts: Verdicts, generator?: (tabs: { id: string; title: string }[]) => unknown) {
  return installFakeFetch((request: RecordedRequest) => {
    if (request.url.endsWith('/v1/systemone')) {
      const [choice, confidence] = verdicts[request.body.state.title] ?? ['none_of_the_above', 0.9];
      return systemOneReply({ group: { choice, confidence } });
    }
    if (!generator) return new Error('Generatore inatteso');
    const tabs = JSON.parse(request.body.messages[1].content).tabs;
    return openAiReply(generator(tabs));
  });
}

const summary = (state: Awaited<ReturnType<Organizer['propose']>>) =>
  state.proposal!.groups.map((g) => [g.name, g.provenance, g.tabs.map((t) => t.title)]);

function open(...titles: string[]) {
  titles.forEach((title, i) => strip.addTab({ url: `https://site${i}.com/${title.toLowerCase()}`, title }));
}

describe('Classificatore System One', () => {
  it('usa POST /v1/systemone con una domanda choice per tab e le opzioni come criteria', async () => {
    await saveApiKey('classifier', 'sk-jev');
    const mine = strip.addTab({ url: 'https://x.com/', title: 'X' });
    await strip.addGroup('Mio', 'pink', [mine]);
    open('Posta');
    const { requests } = servers({ Posta: ['Lavoro', 0.95] });

    await organizer.propose(W);

    const [request] = requests;
    expect(request!.url).toBe('http://127.0.0.1:8009/v1/systemone');
    expect(request!.headers.authorization).toBe('Bearer sk-jev');
    expect(request!.body.model).toBeUndefined();
    expect(request!.body.state).toEqual({ title: 'Posta', url: 'site0.com/posta' });
    expect(request!.body.questions.group).toEqual({
      type: 'choice',
      instructions: expect.any(String),
      criteria: {
        Lavoro: 'Email e documenti di lavoro',
        Notizie: 'Giornali',
        Mio: 'Gruppo creato dall\'utente: «Mio»',
        none_of_the_above: expect.any(String),
      },
    });
  });

  it('senza chiave (server locali) non invia l\'intestazione Authorization; con Jev invia il modello', async () => {
    open('Posta');
    let { requests } = servers({});
    await organizer.propose(W);
    expect(requests[0]!.headers.authorization).toBeUndefined();

    await saveSettings({ classifier: { preset: 'jev', baseUrl: 'https://api.typesafe.ai', model: 'jev-latest' } });
    installFakePermissions(['https://api.typesafe.ai/*']);
    ({ requests } = servers({}));
    await organizer.propose(W, { force: true });
    expect(requests[0]!.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(requests[0]!.body.model).toBe('jev-latest');
  });

  it('le opzioni nei criteria sono al massimo 255', async () => {
    await saveSettings({
      categories: Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, name: `Cat ${i}`, description: '', color: 'blue' as const })),
    });
    open('Posta');
    const { requests } = servers({});

    await organizer.propose(W);

    expect(Object.keys(requests[0]!.body.questions.group.criteria)).toHaveLength(255);
  });

  it('riga 2 (solo Classificatore): assegna sopra soglia, le tab incerte e le categorie sotto il minimo restano libere', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'X' });
    await strip.addGroup('Mio', 'pink', [mine]);
    open('Posta', 'Documento', 'Giornale', 'Incerta', 'Extra');
    servers({
      Posta: ['Lavoro', 0.95],
      Documento: ['Lavoro', 0.8],
      Giornale: ['Notizie', 0.99], // da sola: la categoria non raggiunge il minimo
      Incerta: ['Lavoro', 0.5], // sotto la soglia di 0,7
      Extra: ['Mio', 0.9], // una tab sola può entrare in un gruppo esistente
    });

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([
      ['Lavoro', 'list', ['Posta', 'Documento']],
      ['Mio', 'existing', ['Extra']],
    ]);
    expect(state.proposal!.warnings).toEqual([]);
  });

  it('la soglia è configurabile', async () => {
    await saveSettings({ threshold: 0.9 });
    open('Posta', 'Documento');
    servers({ Posta: ['Lavoro', 0.95], Documento: ['Lavoro', 0.8] });

    expect(summary(await organizer.propose(W))).toEqual([]);
  });

  it('riga 1: le tab rimaste passano al Generatore "solo nuovi"; i gruppi nuovi sotto il minimo vengono sciolti', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento', 'Giornale', 'Ricetta', 'Pizza', 'Sola');
    const { requests } = servers(
      {
        Posta: ['Lavoro', 0.95],
        Documento: ['Lavoro', 0.9],
        Giornale: ['Notizie', 0.99],
        Ricetta: ['Lavoro', 0.3],
        Pizza: ['none_of_the_above', 0.9],
        Sola: ['Lavoro', 0.2],
      },
      () => ({ groups: [{ name: 'Cucina', tabs: ['t4', 't5'] }, { name: 'Varie', tabs: ['t6'] }, { name: 'Intrusa', tabs: ['t1'] }] }),
    );

    const state = await organizer.propose(W);

    const generatorRequest = requests.find((r) => r.url.endsWith('/chat/completions'))!;
    const sent = JSON.parse(generatorRequest.body.messages[1].content);
    // Solo le rimaste: sotto soglia, "nessuna" e la categoria rimasta sola.
    expect(sent.tabs.map((t: { title: string }) => t.title)).toEqual(['Giornale', 'Ricetta', 'Pizza', 'Sola']);
    expect(generatorRequest.body.messages[0].content).toContain('Do not reuse the known options');
    expect(summary(state)).toEqual([
      ['Lavoro', 'list', ['Posta', 'Documento']],
      ['Cucina', 'ai', ['Ricetta', 'Pizza']],
    ]);
  });

  it('il Generatore non viene chiamato se non ci sono tab rimaste', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento');
    const { requests } = servers({ Posta: ['Lavoro', 0.95], Documento: ['Lavoro', 0.9] });

    const state = await organizer.propose(W);

    expect(requests.every((r) => r.url.endsWith('/v1/systemone'))).toBe(true);
    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento']]]);
  });

  it('se il passo 2 fallisce, le rimaste restano libere e compare un avviso', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento', 'Ricetta', 'Pizza');
    servers({ Posta: ['Lavoro', 0.95], Documento: ['Lavoro', 0.9] }, () => 'non json');

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento']]]);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'OpenRouter (openrouter.ai)', cause: 'invalid-response' }]);
  });

  it('se il Classificatore va in errore si passa al Generatore "completo", con un avviso', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento');
    const { requests } = installFakeFetch((request: RecordedRequest) =>
      request.url.endsWith('/v1/systemone') ? new TypeError('Failed to fetch') : openAiReply({ groups: [{ name: 'Lavoro', tabs: ['t1', 't2'] }] }),
    );

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento']]]);
    expect(state.proposal!.warnings).toEqual([{ level: 'classifier', provider: 'Kev (127.0.0.1:8009)', cause: 'unreachable' }]);
    expect(requests.at(-1)!.body.messages[0].content).toContain('Prefer the known options');
  });

  it('se il Classificatore va in errore e non c\'è Generatore, la proposta è per dominio', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    installFakeFetch(httpError(401));

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([['a.com', 'domain', ['A1', 'A2']]]);
    expect(state.proposal!.warnings).toEqual([{ level: 'classifier', provider: 'Kev (127.0.0.1:8009)', cause: 'invalid-key' }]);
  });

  it('senza permesso host il Classificatore non è usato, con un avviso', async () => {
    installFakePermissions([]);
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const { fetchMock } = installFakeFetch(httpError(500));

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.proposal!.warnings).toEqual([{ level: 'classifier', provider: 'Kev (127.0.0.1:8009)', cause: 'no-permission' }]);
  });
});

describe('strategie di richiesta del Classificatore', () => {
  const tabs = [
    { id: 't1', title: 'Posta', url: 'mail.com' },
    { id: 't2', title: 'Giornale', url: 'news.com' },
  ];
  const options = [{ name: 'Lavoro', description: 'L' }, { name: 'Notizie', description: 'N' }];

  it('"batch" invia una sola richiesta con una domanda per tab e dà lo stesso risultato', async () => {
    const { requests } = installFakeFetch(
      systemOneReply({ t1: { choice: 'Lavoro', confidence: 0.9 }, t2: { choice: 'Notizie', confidence: 0.8 } }),
    );
    const classifier = createSystemOneClassifier({ label: 'Kev', baseUrl: 'http://k', strategy: 'batch' });

    const result = await classifier.classify(tabs, options);

    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0]!.body.questions)).toEqual(['t1', 't2']);
    expect(requests[0]!.body.state).toEqual([
      { id: 't1', title: 'Posta', url: 'mail.com' },
      { id: 't2', title: 'Giornale', url: 'news.com' },
    ]);
    expect([...result]).toEqual([
      ['t1', { choice: 'Lavoro', confidence: 0.9 }],
      ['t2', { choice: 'Notizie', confidence: 0.8 }],
    ]);
  });

  it('"per-tab" rispetta il limite di richieste in parallelo', async () => {
    let active = 0;
    let peak = 0;
    installFakeFetch(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return systemOneReply({ group: { choice: 'Lavoro', confidence: 0.9 } });
    });
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, url: 'x.com' }));

    await createSystemOneClassifier({ label: 'Kev', baseUrl: 'http://k', concurrency: 3 }).classify(many, options);

    expect(peak).toBe(3);
  });

  it('una scelta sconosciuta o "nessuna" lascia la tab senza categoria', async () => {
    installFakeFetch(systemOneReply({ t1: { choice: 'Inventata', confidence: 0.99 }, t2: { choice: 'none_of_the_above', confidence: 0.99 } }));

    const result = await createSystemOneClassifier({ label: 'Kev', baseUrl: 'http://k', strategy: 'batch' }).classify(tabs, options);

    expect([...result.values()].map((r) => r.choice)).toEqual([null, null]);
  });
});

describe('review AG-R2', () => {
  it('senza opzioni il Classificatore non viene interrogato: decide il Generatore', async () => {
    await saveSettings({ categories: [], generator: OPENROUTER });
    open('Posta', 'Documento');
    const { requests } = servers({}, () => ({ groups: [{ name: 'Lavoro', tabs: ['t1', 't2'] }] }));

    const state = await organizer.propose(W);

    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(['/api/v1/chat/completions']);
    expect(summary(state)).toEqual([['Lavoro', 'ai', ['Posta', 'Documento']]]);
  });

  it('il passo 2 non parte se le tab rimaste sono meno del minimo', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento', 'Sola');
    const { requests } = servers({ Posta: ['Lavoro', 0.95], Documento: ['Lavoro', 0.9], Sola: ['Lavoro', 0.1] });

    const state = await organizer.propose(W);

    expect(requests.every((r) => r.url.endsWith('/v1/systemone'))).toBe(true);
    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento']]]);
  });
});
