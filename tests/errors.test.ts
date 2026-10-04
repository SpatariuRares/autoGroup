import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { HANG, httpError, installFakeFetch, installFakePermissions, openAiReply, systemOneReply, type RecordedRequest } from './fake-network';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;
const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' };
const KEV = { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' };
const GEN = 'OpenRouter (https://openrouter.ai/api/v1)';
const CLS = 'Kev (http://127.0.0.1:8009)';

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['https://openrouter.ai/*', 'http://127.0.0.1/*']);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ generator: OPENROUTER });
  strip.addTab({ url: 'https://a.com/1', title: 'A1' });
  strip.addTab({ url: 'https://a.com/2', title: 'A2' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const AI_GROUP = openAiReply({ groups: [{ name: 'Lettura', tabs: ['t1', 't2'] }] });
const provenances = (state: Awaited<ReturnType<Organizer['propose']>>) => state.proposal!.groups.map((g) => g.provenance);

describe('nuovo tentativo', () => {
  it.each([429, 529, 500, 503])('ritenta una volta dopo un %i e usa la seconda risposta', async (status) => {
    const { requests } = installFakeFetch(httpError(status), AI_GROUP);

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(2);
    expect(provenances(state)).toEqual(['ai']);
    expect(state.proposal!.warnings).toEqual([]);
  });

  it.each([
    [429, 'rate-limit'],
    [529, 'rate-limit'],
    [502, 'unreachable'],
  ] as const)('ritenta una sola volta: due %i di fila portano al livello successivo con l\'avviso "%s"', async (status, cause) => {
    const { requests } = installFakeFetch(httpError(status));

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(2);
    expect(provenances(state)).toEqual(['domain']);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: GEN, cause }]);
  });

  it.each([
    [401, 'invalid-key'],
    [403, 'invalid-key'],
    [422, 'invalid-request'],
  ] as const)('non ritenta dopo un %i: avviso "%s"', async (status, cause) => {
    const { requests } = installFakeFetch(httpError(status), AI_GROUP);

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(1);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: GEN, cause }]);
  });

  it('non ritenta dopo un errore di rete: avviso "non raggiungibile" con nome e URL del provider', async () => {
    const { requests } = installFakeFetch(new TypeError('Failed to fetch'), AI_GROUP);

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(1);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: GEN, cause: 'unreachable' }]);
  });

  it('vale anche per il Classificatore', async () => {
    await saveSettings({ classifier: KEV, generator: { preset: 'none', baseUrl: '', model: '' } });
    const { requests } = installFakeFetch(httpError(503), systemOneReply({ group: { choice: 'Lavoro', confidence: 0.9 } }));

    const state = await organizer.propose(W);

    expect(requests).toHaveLength(3); // una tab: 503 + nuovo tentativo; l'altra tab: subito ok
    expect(provenances(state)).toEqual(['list']);
  });
});

describe('timeout', () => {
  it('il Generatore che non risponde in tempo porta al dominio con l\'avviso "timeout"', async () => {
    installFakeFetch(HANG);

    const state = await organizer.propose(W);

    expect(provenances(state)).toEqual(['domain']);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: GEN, cause: 'timeout' }]);
  });

  it('il Classificatore che non risponde in tempo porta al Generatore con l\'avviso "timeout"', async () => {
    await saveSettings({ classifier: KEV });
    installFakeFetch((request: RecordedRequest) => (request.url.endsWith('/v1/systemone') ? HANG() : AI_GROUP));

    const state = await organizer.propose(W);

    expect(provenances(state)).toEqual(['ai']);
    expect(state.proposal!.warnings).toEqual([{ level: 'classifier', provider: CLS, cause: 'timeout' }]);
  });

  it('un timeout non viene ritentato', async () => {
    const { requests } = installFakeFetch(HANG);

    await organizer.propose(W);

    expect(requests).toHaveLength(1);
  });
});

describe('risposte non valide', () => {
  it.each([
    ['non JSON', () => new Response('<html>', { status: 200 })],
    ['senza choices', () => new Response('{"oops":1}', { status: 200 })],
    ['fuori schema', () => openAiReply({ gruppi: [] })],
  ])('una risposta %s porta al livello successivo con l\'avviso "risposta non valida"', async (_, reply) => {
    installFakeFetch(reply());

    const state = await organizer.propose(W);

    expect(provenances(state)).toEqual(['domain']);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: GEN, cause: 'invalid-response' }]);
  });

  it('una risposta System One senza answers porta al livello successivo', async () => {
    await saveSettings({ classifier: KEV });
    installFakeFetch((request: RecordedRequest) =>
      request.url.endsWith('/v1/systemone') ? new Response('{"model":"x"}', { status: 200 }) : AI_GROUP,
    );

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toEqual([{ level: 'classifier', provider: CLS, cause: 'invalid-response' }]);
  });
});

describe('Interrompi', () => {
  it('annulla le richieste in corso e non produce nessuna proposta', async () => {
    const { requests } = installFakeFetch(HANG);

    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await organizer.abort();
    const state = await running;

    expect(requests[0]!.signal!.aborted).toBe(true);
    expect(state.phase).toBe('idle');
    expect(state.proposal).toBeUndefined();
    expect(state.notice).toEqual({ key: 'popupAborted' });
    expect((await organizer.state()).proposal).toBeUndefined();
  });

  it('interrompe anche l\'attesa prima del nuovo tentativo', async () => {
    const { requests } = installFakeFetch(httpError(503), AI_GROUP);
    const { TIMINGS } = await import('../src/ai/http');
    TIMINGS.retryDelay = 10_000;

    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await organizer.abort();
    const state = await running;

    expect(requests).toHaveLength(1);
    expect(state.proposal).toBeUndefined();
  });

  it('dopo "Interrompi" si può chiedere una nuova proposta; "Annulla" resta disponibile', async () => {
    installFakeFetch(AI_GROUP);
    await organizer.propose(W);
    await organizer.apply();

    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    const { requests } = installFakeFetch(HANG);
    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await organizer.abort();
    expect((await running).undo).toBeDefined();

    installFakeFetch(openAiReply({ groups: [{ name: 'Altro', tabs: ['t1', 't2'] }] }));
    const state = await organizer.propose(W);
    expect(state.proposal!.groups.map((g) => g.name)).toEqual(['Altro']);
  });

  it('interrompe anche un calcolo ancora in coda, che non parte', async () => {
    strip.addTab({ url: 'https://c.com/1', title: 'C1', windowId: 2 });
    strip.addTab({ url: 'https://c.com/2', title: 'C2', windowId: 2 });
    const { requests } = installFakeFetch(HANG);

    const first = organizer.propose(W);
    const queued = organizer.propose(2);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await organizer.abort();

    expect((await first).notice).toEqual({ key: 'popupAborted' });
    const second = await queued;
    expect(second.windowId).toBe(2);
    expect(second.proposal).toBeUndefined();
    expect(second.notice).toEqual({ key: 'popupAborted' });
    expect(requests).toHaveLength(1);
  });

  it('"Interrompi" senza un calcolo in corso non cambia nulla', async () => {
    installFakeFetch(AI_GROUP);
    const before = await organizer.propose(W);

    expect(await organizer.abort()).toEqual(before);
  });
});

describe('calcoli contemporanei', () => {
  it('due richieste per la stessa finestra condividono il calcolo', async () => {
    const { requests } = installFakeFetch(AI_GROUP);

    const [a, b] = await Promise.all([organizer.propose(W), organizer.propose(W)]);

    expect(requests).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it('una richiesta per un\'altra finestra non riceve la proposta della prima', async () => {
    strip.addTab({ url: 'https://c.com/1', title: 'C1', windowId: 2 });
    strip.addTab({ url: 'https://c.com/2', title: 'C2', windowId: 2 });
    installFakeFetch(AI_GROUP);

    const [a, b] = await Promise.all([organizer.propose(W), organizer.propose(2)]);

    expect(a.proposal!.groups[0]!.tabs.map((t) => t.title)).toEqual(['A1', 'A2']);
    expect(b.windowId).toBe(2);
    expect(b.proposal!.groups[0]!.tabs.map((t) => t.title)).toEqual(['C1', 'C2']);
  });

  it('"Ricalcola" durante un calcolo ne avvia uno nuovo invece di riusare quello in corso', async () => {
    const { requests } = installFakeFetch(AI_GROUP);

    const [, forced] = await Promise.all([organizer.propose(W), organizer.propose(W, { force: true })]);

    expect(requests).toHaveLength(2);
    expect(forced.phase).toBe('ready');
  });
});

describe('sempre una proposta', () => {
  it('con Classificatore e Generatore entrambi in errore la proposta è per dominio, con due avvisi', async () => {
    await saveSettings({ classifier: KEV });
    installFakeFetch(httpError(401));

    const state = await organizer.propose(W);

    expect(provenances(state)).toEqual(['domain']);
    expect(state.proposal!.warnings).toEqual([
      { level: 'classifier', provider: CLS, cause: 'invalid-key' },
      { level: 'generator', provider: GEN, cause: 'invalid-key' },
    ]);
  });
});
