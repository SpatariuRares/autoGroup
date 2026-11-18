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

/** Fake System One: the choice depends on the tab title; "Illeggibile" gets a reply without confidence. */
function classifierServer(verdicts: Record<string, [string, number]>) {
  return installFakeFetch((request: RecordedRequest) => {
    if (!request.url.endsWith('/v1/systemone')) return new Error('Generatore inatteso');
    if (request.body.state.title === 'Illeggibile') return new Response(JSON.stringify({ answers: { group: { type: 'choice' } } }), { status: 200 });
    const [choice, confidence] = verdicts[request.body.state.title] ?? ['none_of_the_above', 0.9];
    return systemOneReply({ group: { choice, confidence } });
  });
}

describe('Classifier result cache', () => {
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

  it('opening a tab classifies only that one, with the same result as a computation from scratch', async () => {
    const { requests } = classifierServer(VERDICTS);
    await organizer.propose(W);
    expect(systemOne(requests)).toHaveLength(4);

    strip.addTab({ url: 'https://agenda.com/', title: 'Agenda' });
    const state = await organizer.propose(W);

    expect(systemOne(requests)).toHaveLength(5);
    expect(systemOne(requests).at(-1)!.body.state.title).toBe('Agenda');
    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento', 'Agenda']]]);
  });

  it('"Recompute" and changing the threshold make no request again', async () => {
    const { requests } = classifierServer(VERDICTS);
    await organizer.propose(W);

    await recompute();
    await saveSettings({ threshold: 0.5 });
    const state = await organizer.propose(W);

    expect(systemOne(requests)).toHaveLength(4);
    // With the threshold at 0.5 also "Quotidiano" (0.6) enters Notizie.
    expect(summary(state)).toEqual([
      ['Lavoro', 'list', ['Posta', 'Documento']],
      ['Notizie', 'list', ['Giornale', 'Quotidiano']],
    ]);
  });

  it('changing the description of a category or the model reclassifies all the tabs', async () => {
    const { requests } = classifierServer(VERDICTS);
    await organizer.propose(W);

    await saveSettings({ categories: [{ ...CATEGORIES[0]!, description: 'Altro' }, CATEGORIES[1]!] });
    await organizer.propose(W);
    expect(systemOne(requests)).toHaveLength(8);

    await saveSettings({ classifier: { ...KEV, model: 'kev-2' } });
    await organizer.propose(W);
    expect(systemOne(requests)).toHaveLength(12);
  });

  it('an unreadable response is not remembered: the next computation asks again', async () => {
    strip.addTab({ url: 'https://strano.com/', title: 'Illeggibile' });
    const { requests } = classifierServer(VERDICTS);
    await organizer.propose(W);

    await recompute();

    expect(systemOne(requests).map((r) => r.body.state.title).slice(5)).toEqual(['Illeggibile']);
  });

  it('if the Classifier fails nothing is remembered and it falls to the next level', async () => {
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

describe('description cache', () => {
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

  it('a new computation reads only the new pages, and the descriptions read still reach the AI', async () => {
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

  it('a page that did not respond in time is retried in the next computation', async () => {
    const slow = open('Lenta', 'https://lenta.com/', { description: 'Tardi', delay: Infinity });
    const { read } = installFakeScripting(pages);
    installFakeFetch(openAiReply({ groups: [] }));
    await organizer.propose(W);

    await recompute();

    expect(read).toEqual([slow, slow]);
  });

  it('an inaccessible page is retried in the next computation', async () => {
    const denied = strip.addTab({ url: 'https://negata.com/', title: 'Negata' });
    const { read } = installFakeScripting(pages);
    installFakeFetch(openAiReply({ groups: [] }));
    await organizer.propose(W);

    await recompute();

    expect(read).toEqual([denied, denied]);
  });

  it('a suspended tab finds again the description already read for the same URL, without being read', async () => {
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
  it('beyond the limit the oldest entries are evicted; a rewritten entry becomes the most recent', async () => {
    const cache = createSessionCache<number>('test', 2);
    await cache.setMany(new Map([['a', 1], ['b', 2]]));
    await cache.setMany(new Map([['a', 10]]));
    await cache.setMany(new Map([['c', 3]]));

    expect(await cache.getMany(['a', 'b', 'c'])).toEqual(new Map([['a', 10], ['c', 3]]));
  });
});

describe('OpenAI-compatible Generator: limited time and light requests', () => {
  beforeEach(async () => {
    await saveSettings({ generator: OPENROUTER, categories: CATEGORIES });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
  });

  it('asks for at most GENERATE_MAX_TOKENS tokens', async () => {
    const { requests } = installFakeFetch(openAiReply({ groups: [] }));

    await organizer.propose(W);

    expect(requests[0]!.body.max_tokens).toBe(GENERATE_MAX_TOKENS);
  });

  it('a response cut off by the cap becomes "invalid response" and falls back to the domain', async () => {
    const truncated = new Response(JSON.stringify({ choices: [{ message: { content: '{"groups":[{"name":"Let' }, finish_reason: 'length' }] }), { status: 200 });
    installFakeFetch(truncated);

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'invalid-response' }]);
    expect(summary(state)).toEqual([['a.com', 'domain', ['A1', 'A2']]]);
  });

  it('after a 400 it retries once with the minimal request, without schema or cap', async () => {
    const { requests } = installFakeFetch(httpError(400), openAiReply({ groups: [{ name: 'Lavoro', tabs: ['t1', 't2'] }] }));

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(2);
    expect(requests[1]!.body).not.toHaveProperty('max_tokens');
    expect(requests[1]!.body).not.toHaveProperty('response_format');
    expect(summary(state)).toEqual([['Lavoro', 'list', ['A1', 'A2']]]);
  });

  it('in "new only" mode the options arrive by name only; in "full" with the description', async () => {
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

describe('Gemini Nano: session ready early and reused', () => {
  beforeEach(() => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
  });

  const twoTabs = () => ({ groups: [{ name: 'Lettura', tabs: ['t1', 't2'] }] });

  it('the session with the system prompt is created once and reused by the following computations', async () => {
    const nano = installFakeNano({ availability: 'available', respond: twoTabs });

    await organizer.propose(W);
    const again = await recompute();

    expect(nano.created.count).toBe(1);
    expect(nano.calls).toHaveLength(2);
    expect(summary(again)).toEqual([['Lettura', 'ai', ['A1', 'A2']]]);
  });

  it('with the Classifier, Nano creates the session while the Classifier works', async () => {
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

  it('a failed creation is not reused: the next computation creates a new one', async () => {
    installFakeNano({ availability: 'available', respond: twoTabs });
    (LanguageModel.create as unknown as Mock).mockRejectedValueOnce(new Error('GPU occupata'));

    const failed = await organizer.propose(W);
    expect(failed.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'unavailable' }]);

    const retry = await recompute();
    expect(retry.proposal!.warnings).toEqual([]);
    expect(summary(retry)).toEqual([['Lettura', 'ai', ['A1', 'A2']]]);
  });

  it('if the creation started early fails, the Generator creates a new one instead of reusing it', async () => {
    await saveSettings({ classifier: KEV, categories: CATEGORIES });
    installFakeNano({ availability: 'available', respond: twoTabs });
    (LanguageModel.create as unknown as Mock).mockRejectedValueOnce(new Error('GPU occupata'));
    installFakeFetch(async () => {
      // The Classifier responds after the early creation has already failed.
      await new Promise((r) => setTimeout(r, 5));
      return systemOneReply({ group: { choice: 'none_of_the_above', confidence: 0.9 } });
    });

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toEqual([]);
    expect(summary(state)).toEqual([['Lettura', 'ai', ['A1', 'A2']]]);
  });

  it('a session that stops working (e.g. destroyed by Chrome) is recreated in the next computation', async () => {
    const nano = installFakeNano({ availability: 'available', respond: twoTabs, cloneError: new Error('session destroyed') });

    const failed = await organizer.propose(W);
    expect(failed.proposal!.warnings).toMatchObject([{ level: 'generator', cause: 'invalid-request' }]);

    await recompute();
    expect(nano.created.count).toBe(2);
  });
});
