import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { installFakeNano } from './fake-nano';
import { installFakeFetch, installFakePermissions, openAiReply } from './fake-network';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions([]);
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const summary = (state: Awaited<ReturnType<Organizer['propose']>>) =>
  state.proposal!.groups.map((g) => [g.name, g.provenance, g.tabs.map((t) => t.title)]);

function openPairs() {
  strip.addTab({ url: 'https://a.com/1', title: 'A1' });
  strip.addTab({ url: 'https://a.com/2', title: 'A2' });
  strip.addTab({ url: 'https://b.com/1', title: 'B1' });
  strip.addTab({ url: 'https://b.com/2', title: 'B2' });
}

describe('Gemini Nano as built-in Generator', () => {
  it('if no Generator is configured and Nano is available, it uses it with the JSON schema and without network', async () => {
    openPairs();
    const { calls } = installFakeNano({
      availability: 'available',
      respond: () => ({ groups: [{ name: 'Notizie', tabs: ['t1', 't2'] }, { name: 'Ricette', tabs: ['t3', 't4'] }] }),
    });
    const { fetchMock } = installFakeFetch(openAiReply({ groups: [] }));

    const state = await organizer.propose(W);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.proposal!.warnings).toEqual([]);
    expect(summary(state)).toEqual([
      ['Notizie', 'list', ['A1', 'A2']],
      ['Ricette', 'ai', ['B1', 'B2']],
    ]);
    expect(calls[0]!.schema).toMatchObject({ required: ['groups'] });
    expect(calls[0]!.tabs).toEqual([
      { id: 't1', title: 'A1', url: 'a.com/1' },
      { id: 't2', title: 'A2', url: 'a.com/2' },
      { id: 't3', title: 'B1', url: 'b.com/1' },
      { id: 't4', title: 'B2', url: 'b.com/2' },
    ]);
    // Nano does not answer in Italian: declared language and names requested in English, as the Prompt API requires.
    expect(calls[0]!.system).toContain('in English');
    const declared = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
    expect(LanguageModel.availability).toHaveBeenCalledWith(declared);
    expect(LanguageModel.create).toHaveBeenCalledWith(expect.objectContaining(declared));
  });

  it('the configured Generator takes precedence over Nano', async () => {
    installFakePermissions(['https://openrouter.ai/*']);
    await saveSettings({ generator: { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' } });
    openPairs();
    const nano = installFakeNano({ availability: 'available' });
    const { fetchMock } = installFakeFetch(openAiReply({ groups: [{ name: 'Tutto', tabs: ['t1', 't2', 't3', 't4'] }] }));

    const state = await organizer.propose(W);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(nano.created.count).toBe(0);
    expect(summary(state)).toEqual([['Tutto', 'ai', ['A1', 'A2', 'B1', 'B2']]]);
  });

  it('a configured Generator without permission is not replaced by Nano: domain, with a warning', async () => {
    await saveSettings({ generator: { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' } });
    openPairs();
    const nano = installFakeNano({ availability: 'available' });

    const state = await organizer.propose(W);

    expect(nano.created.count).toBe(0);
    expect(summary(state).map(([, provenance]) => provenance)).toEqual(['domain', 'domain']);
    expect(state.proposal!.warnings.map((w) => w.cause)).toEqual(['no-permission']);
  });

  it('with the Generator set to "None", Nano is neither used nor queried', async () => {
    await saveSettings({ generator: { preset: 'none', baseUrl: '', model: '' } });
    openPairs();
    const nano = installFakeNano({ availability: 'available' });

    const state = await organizer.propose(W);

    expect(nano.created.count).toBe(0);
    expect(LanguageModel.availability).not.toHaveBeenCalled();
    // Without any provider only the site rules apply: here there are none.
    expect(summary(state)).toEqual([]);
    expect(state.proposal!.warnings).toEqual([]);
  });

  it.each([
    ['downloadable', [{ level: 'generator', provider: 'Gemini Nano', cause: 'needs-download' }]],
    ['downloading', [{ level: 'generator', provider: 'Gemini Nano', cause: 'downloading' }]],
    ['unavailable', [{ level: 'generator', provider: 'Gemini Nano', cause: 'not-supported' }]],
  ] as const)('with Nano "%s" the proposal is per domain, without using it', async (availability, warnings) => {
    openPairs();
    const nano = installFakeNano({ availability });

    const state = await organizer.propose(W);

    expect(nano.created.count).toBe(0);
    expect(summary(state).map(([, provenance]) => provenance)).toEqual(['domain', 'domain']);
    expect(state.proposal!.warnings).toEqual(warnings);
  });

  it('without the Prompt API in the browser the proposal is per domain, with the warning that Nano is not supported', async () => {
    openPairs();

    const state = await organizer.propose(W);

    expect(summary(state).map(([, provenance]) => provenance)).toEqual(['domain', 'domain']);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'Gemini Nano', cause: 'not-supported' }]);
  });

  it('in per-site mode unsupported Nano gives no warnings', async () => {
    await saveSettings({ mode: 'domain' });
    openPairs();

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toEqual([]);
  });

  it('if the tabs exceed the context they are sent in chunks, passing the invented names to the following chunks', async () => {
    for (let i = 1; i <= 12; i++) strip.addTab({ url: `https://site${i}.com/pagina-con-un-percorso-lungo`, title: `Pagina numero ${i} con un titolo abbastanza lungo` });
    await saveSettings({ categories: [] });
    const { calls } = installFakeNano({
      availability: 'available',
      contextWindow: 420,
      // Each chunk puts all its tabs in the same invented group.
      respond: (call) => ({ groups: [{ name: 'Lettura', tabs: call.tabs.map((t) => t.id) }] }),
    });

    const state = await organizer.propose(W);

    expect(calls.length).toBeGreaterThan(1);
    expect(calls.flatMap((c) => c.tabs.map((t) => t.id))).toEqual(Array.from({ length: 12 }, (_, i) => `t${i + 1}`));
    expect(calls[0]!.options).toEqual([]);
    expect(calls[1]!.options).toEqual([{ name: 'Lettura', description: '' }]);
    // Groups with the same name across the chunks become one.
    expect(summary(state).map(([name, , tabs]) => [name, (tabs as string[]).length])).toEqual([['Lettura', 12]]);
  });

  it('if Nano fails the proposal is per domain, with a warning', async () => {
    openPairs();
    installFakeNano({ availability: 'available', respond: () => new Error('QuotaExceededError') });

    const state = await organizer.propose(W);

    expect(summary(state).map(([, provenance]) => provenance)).toEqual(['domain', 'domain']);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'Gemini Nano', cause: 'invalid-request' }]);
  });

  it('an unexpected session error (e.g. clone) becomes "request rejected", not a generic error', async () => {
    openPairs();
    installFakeNano({ availability: 'available', cloneError: new Error('InvalidStateError') });

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'Gemini Nano', cause: 'invalid-request' }]);
  });

  it('the time limit applies to each chunk, not to all the chunks together', async () => {
    // In tests the Generator's time limit is 200 ms: two chunks of 120 ms exceed it together, not one by one.
    for (let i = 1; i <= 12; i++) strip.addTab({ url: `https://site${i}.com/pagina-con-un-percorso-lungo`, title: `Pagina numero ${i} con un titolo abbastanza lungo` });
    await saveSettings({ categories: [] });
    const { calls } = installFakeNano({
      availability: 'available',
      contextWindow: 420,
      delay: 120,
      respond: (call) => ({ groups: [{ name: 'Lettura', tabs: call.tabs.map((t) => t.id) }] }),
    });

    const state = await organizer.propose(W);

    expect(calls.length).toBeGreaterThan(1);
    expect(state.proposal!.warnings).toEqual([]);
    expect(summary(state)).toHaveLength(1);
  });

  it('validates the response of Nano like that of the other Generators', async () => {
    openPairs();
    installFakeNano({
      availability: 'available',
      respond: () => ({ groups: [{ name: 'Troppe parole qui', tabs: ['t1', 't2'] }, { name: 'Ok', tabs: ['t3', 't4', 't77'] }] }),
    });

    expect(summary(await organizer.propose(W))).toEqual([['Ok', 'ai', ['B1', 'B2']]]);
  });
});
