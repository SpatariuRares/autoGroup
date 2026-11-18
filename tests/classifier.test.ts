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
  // No Generator, except in the tests that configure one: Nano (the default) is not supported here and would give a warning.
  await saveSettings({
    classifier: KEV,
    generator: { preset: 'none', baseUrl: '', model: '' },
    categories: [
      { id: 'w', name: 'Lavoro', description: 'Email e documenti di lavoro', color: 'blue' },
      { id: 'n', name: 'Notizie', description: 'Giornali', color: 'red' },
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Classification decided by the tab title: "title" → [choice, confidence]. */
type Verdicts = Record<string, [string, number]>;

/** Fake server: System One replies according to `verdicts`, the Generator with `generator(remaining tabs)`. */
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

describe('System One Classifier', () => {
  it('uses POST /v1/systemone with a choice question per tab and the options as criteria', async () => {
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

  it('without a key (local servers) does not send the Authorization header; with Jev it sends the model', async () => {
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

  it('the options in the criteria are at most 255', async () => {
    await saveSettings({
      categories: Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, name: `Cat ${i}`, description: '', color: 'blue' as const })),
    });
    open('Posta');
    const { requests } = servers({});

    await organizer.propose(W);

    expect(Object.keys(requests[0]!.body.questions.group.criteria)).toHaveLength(255);
  });

  it('row 2 (Classifier only): assigns above the threshold, the uncertain tabs and the categories below the minimum stay free', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'X' });
    await strip.addGroup('Mio', 'pink', [mine]);
    open('Posta', 'Documento', 'Giornale', 'Incerta', 'Extra');
    servers({
      Posta: ['Lavoro', 0.95],
      Documento: ['Lavoro', 0.8],
      Giornale: ['Notizie', 0.99], // alone: the category does not reach the minimum
      Incerta: ['Lavoro', 0.5], // below the threshold of 0.7
      Extra: ['Mio', 0.9], // a single tab can join an existing group
    });

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([
      ['Lavoro', 'list', ['Posta', 'Documento']],
      ['Mio', 'existing', ['Extra']],
    ]);
    expect(state.proposal!.warnings).toEqual([]);
  });

  it('the threshold is configurable', async () => {
    await saveSettings({ threshold: 0.9 });
    open('Posta', 'Documento');
    servers({ Posta: ['Lavoro', 0.95], Documento: ['Lavoro', 0.8] });

    expect(summary(await organizer.propose(W))).toEqual([]);
  });

  it('row 1: the remaining tabs go to the Generator "new only"; new groups below the minimum are dissolved', async () => {
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
    // Only the remaining ones: below threshold, "none" and the category left alone.
    expect(sent.tabs.map((t: { title: string }) => t.title)).toEqual(['Giornale', 'Ricetta', 'Pizza', 'Sola']);
    expect(generatorRequest.body.messages[0].content).toContain('Do not reuse the known options');
    expect(summary(state)).toEqual([
      ['Lavoro', 'list', ['Posta', 'Documento']],
      ['Cucina', 'ai', ['Ricetta', 'Pizza']],
    ]);
  });

  it('the Generator is not called if no tabs remain', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento');
    const { requests } = servers({ Posta: ['Lavoro', 0.95], Documento: ['Lavoro', 0.9] });

    const state = await organizer.propose(W);

    expect(requests.every((r) => r.url.endsWith('/v1/systemone'))).toBe(true);
    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento']]]);
  });

  it('if step 2 fails, the remaining ones stay free and a warning appears', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento', 'Ricetta', 'Pizza');
    servers({ Posta: ['Lavoro', 0.95], Documento: ['Lavoro', 0.9] }, () => 'non json');

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento']]]);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'OpenRouter (https://openrouter.ai/api/v1)', cause: 'invalid-response' }]);
  });

  it('if the Classifier errors, it falls back to the "full" Generator, with a warning', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento');
    const { requests } = installFakeFetch((request: RecordedRequest) =>
      request.url.endsWith('/v1/systemone') ? new TypeError('Failed to fetch') : openAiReply({ groups: [{ name: 'Lavoro', tabs: ['t1', 't2'] }] }),
    );

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento']]]);
    expect(state.proposal!.warnings).toEqual([{ level: 'classifier', provider: 'Kev (http://127.0.0.1:8009)', cause: 'unreachable' }]);
    expect(requests.at(-1)!.body.messages[0].content).toContain('Prefer the known options');
  });

  it('if the Classifier errors and there is no Generator, the proposal is by domain', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    installFakeFetch(httpError(401));

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([['a.com', 'domain', ['A1', 'A2']]]);
    expect(state.proposal!.warnings).toEqual([{ level: 'classifier', provider: 'Kev (http://127.0.0.1:8009)', cause: 'invalid-key' }]);
  });

  it('without host permission the Classifier is not used, with a warning', async () => {
    installFakePermissions([]);
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const { fetchMock } = installFakeFetch(httpError(500));

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.proposal!.warnings).toEqual([{ level: 'classifier', provider: 'Kev (http://127.0.0.1:8009)', cause: 'no-permission' }]);
  });
});

describe('Classifier request strategies', () => {
  const tabs = [
    { id: 't1', title: 'Posta', url: 'mail.com' },
    { id: 't2', title: 'Giornale', url: 'news.com' },
  ];
  const options = [{ name: 'Lavoro', description: 'L' }, { name: 'Notizie', description: 'N' }];

  it('"batch" sends a single request with one question per tab and gives the same result', async () => {
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

  it('"per-tab" respects the parallel request limit', async () => {
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

  it('"per-tab" on the first error sends no other requests and interrupts those in progress', async () => {
    const { requests } = installFakeFetch((request: RecordedRequest) =>
      request.body.state.title === 'T0'
        ? new Response('{}', { status: 401 })
        : new Promise<Response>((r) => setTimeout(() => r(systemOneReply({ group: { choice: 'Lavoro', confidence: 0.9 } })), 20)),
    );
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, url: 'x.com' }));

    const outcome = createSystemOneClassifier({ label: 'Jev', baseUrl: 'http://k', concurrency: 3 }).classify(many, options);

    await expect(outcome).rejects.toMatchObject({ reason: 'invalid-key' });
    await new Promise((r) => setTimeout(r, 100)); // time for other requests, if any were started
    expect(requests).toHaveLength(3);
    expect(requests.every((r) => r.signal?.aborted)).toBe(true);
  });

  it('in "By site" mode no AI is queried, even if configured, and there are no warnings', async () => {
    await saveSettings({ mode: 'domain' });
    strip.addTab({ url: 'https://mail.com/1', title: 'Posta' });
    strip.addTab({ url: 'https://mail.com/2', title: 'Posta 2' });
    const { fetchMock } = installFakeFetch(httpError(500));

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(summary(state)).toEqual([['mail.com', 'domain', ['Posta', 'Posta 2']]]);
    expect(state.proposal!.warnings).toEqual([]);
  });

  it('an unknown or "none" choice leaves the tab without category', async () => {
    installFakeFetch(systemOneReply({ t1: { choice: 'Inventata', confidence: 0.99 }, t2: { choice: 'none_of_the_above', confidence: 0.99 } }));

    const result = await createSystemOneClassifier({ label: 'Kev', baseUrl: 'http://k', strategy: 'batch' }).classify(tabs, options);

    expect([...result.values()].map((r) => r.choice)).toEqual([null, null]);
  });
});

describe('review AG-R2', () => {
  it('without options the Classifier is not queried: the Generator decides', async () => {
    await saveSettings({ categories: [], generator: OPENROUTER });
    open('Posta', 'Documento');
    const { requests } = servers({}, () => ({ groups: [{ name: 'Lavoro', tabs: ['t1', 't2'] }] }));

    const state = await organizer.propose(W);

    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(['/api/v1/chat/completions']);
    expect(summary(state)).toEqual([['Lavoro', 'ai', ['Posta', 'Documento']]]);
  });

  it('step 2 does not start if the remaining tabs are fewer than the minimum', async () => {
    await saveSettings({ generator: OPENROUTER });
    open('Posta', 'Documento', 'Sola');
    const { requests } = servers({ Posta: ['Lavoro', 0.95], Documento: ['Lavoro', 0.9], Sola: ['Lavoro', 0.1] });

    const state = await organizer.propose(W);

    expect(requests.every((r) => r.url.endsWith('/v1/systemone'))).toBe(true);
    expect(summary(state)).toEqual([['Lavoro', 'list', ['Posta', 'Documento']]]);
  });
});
