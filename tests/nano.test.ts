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

describe('Gemini Nano come Generatore integrato', () => {
  it('se nessun Generatore è configurato e Nano è disponibile, lo usa con lo schema JSON e senza rete', async () => {
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
    expect(calls[0]!.system).toContain('in italiano');
  });

  it('il Generatore configurato ha la precedenza su Nano', async () => {
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

  it('un Generatore configurato senza permesso lascia il posto a Nano, con un avviso', async () => {
    await saveSettings({ generator: { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' } });
    openPairs();
    installFakeNano({ availability: 'available', respond: () => ({ groups: [{ name: 'Tutto', tabs: ['t1', 't2'] }] }) });

    const state = await organizer.propose(W);

    expect(summary(state)).toEqual([['Tutto', 'ai', ['A1', 'A2']]]);
    expect(state.proposal!.warnings.map((w) => w.cause)).toEqual(['no-permission']);
  });

  it.each([
    ['downloadable', [{ level: 'generator', provider: 'Gemini Nano', cause: 'needs-download' }]],
    ['downloading', [{ level: 'generator', provider: 'Gemini Nano', cause: 'downloading' }]],
    ['unavailable', []],
  ] as const)('con Nano "%s" la proposta è per dominio, senza usarlo', async (availability, warnings) => {
    openPairs();
    const nano = installFakeNano({ availability });

    const state = await organizer.propose(W);

    expect(nano.created.count).toBe(0);
    expect(summary(state).map(([, provenance]) => provenance)).toEqual(['domain', 'domain']);
    expect(state.proposal!.warnings).toEqual(warnings);
  });

  it('senza la Prompt API nel browser la proposta è per dominio, senza avvisi', async () => {
    openPairs();

    const state = await organizer.propose(W);

    expect(summary(state).map(([, provenance]) => provenance)).toEqual(['domain', 'domain']);
    expect(state.proposal!.warnings).toEqual([]);
  });

  it('se le tab superano il contesto le invia a blocchi, passando i nomi inventati ai blocchi successivi', async () => {
    for (let i = 1; i <= 12; i++) strip.addTab({ url: `https://site${i}.com/pagina-con-un-percorso-lungo`, title: `Pagina numero ${i} con un titolo abbastanza lungo` });
    await saveSettings({ categories: [] });
    const { calls } = installFakeNano({
      availability: 'available',
      contextWindow: 420,
      // Ogni blocco mette tutte le sue tab nello stesso gruppo inventato.
      respond: (call) => ({ groups: [{ name: 'Lettura', tabs: call.tabs.map((t) => t.id) }] }),
    });

    const state = await organizer.propose(W);

    expect(calls.length).toBeGreaterThan(1);
    expect(calls.flatMap((c) => c.tabs.map((t) => t.id))).toEqual(Array.from({ length: 12 }, (_, i) => `t${i + 1}`));
    expect(calls[0]!.options).toEqual([]);
    expect(calls[1]!.options).toEqual([{ name: 'Lettura', description: '' }]);
    // I gruppi con lo stesso nome nei vari blocchi diventano uno solo.
    expect(summary(state).map(([name, , tabs]) => [name, (tabs as string[]).length])).toEqual([['Lettura', 12]]);
  });

  it('se Nano va in errore la proposta è per dominio, con un avviso', async () => {
    openPairs();
    installFakeNano({ availability: 'available', respond: () => new Error('QuotaExceededError') });

    const state = await organizer.propose(W);

    expect(summary(state).map(([, provenance]) => provenance)).toEqual(['domain', 'domain']);
    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'Gemini Nano', cause: 'invalid-request' }]);
  });

  it('un errore inatteso della sessione (es. clone) diventa "richiesta rifiutata", non un errore generico', async () => {
    openPairs();
    installFakeNano({ availability: 'available', cloneError: new Error('InvalidStateError') });

    const state = await organizer.propose(W);

    expect(state.proposal!.warnings).toEqual([{ level: 'generator', provider: 'Gemini Nano', cause: 'invalid-request' }]);
  });

  it('il tempo massimo vale per ogni blocco, non per tutti i blocchi insieme', async () => {
    // Nei test il tempo massimo del Generatore è 200 ms: due blocchi da 120 ms lo superano insieme, non uno per uno.
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

  it('valida la risposta di Nano come quella degli altri Generatori', async () => {
    openPairs();
    installFakeNano({
      availability: 'available',
      respond: () => ({ groups: [{ name: 'Troppe parole qui', tabs: ['t1', 't2'] }, { name: 'Ok', tabs: ['t3', 't4', 't77'] }] }),
    });

    expect(summary(await organizer.propose(W))).toEqual([['Ok', 'ai', ['B1', 'B2']]]);
  });
});
