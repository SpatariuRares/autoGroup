import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { createStopwatch } from '../src/organizer/stopwatch';
import { NO_PROVIDER, saveSettings } from '../src/settings';
import type { OrganizerState } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';
import { HANG, installFakeFetch, installFakePermissions, openAiReply } from './fake-network';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
/** Ogni stato annunciato al pannello, nell'ordine. */
let announced: OrganizerState[];
const W = 1;
const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' };

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  installFakePermissions(['https://openrouter.ai/*']);
  strip = installFakeTabStrip({ currentWindowId: W });
  announced = [];
  organizer = createOrganizer({ onStateChange: (state) => announced.push(state) });
  await saveSettings({ generator: OPENROUTER });
  strip.addTab({ url: 'https://a.com/1', title: 'A1' });
  strip.addTab({ url: 'https://a.com/2', title: 'A2' });
  strip.addTab({ url: 'https://b.com/1', title: 'B1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const AI_GROUP = openAiReply({ groups: [{ name: 'Lettura', tabs: ['t1', 't2', 't3'] }] });
const names = (proposal?: { groups: { name: string; provenance: string }[] }) => proposal?.groups.map((g) => [g.name, g.provenance]);

describe('anteprima per sito durante il calcolo', () => {
  it('mentre l\'AI calcola, lo stato contiene subito la proposta per sito; poi arriva quella AI', async () => {
    const { requests } = installFakeFetch(HANG);

    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));

    const computing = announced.at(-1)!;
    expect(computing.phase).toBe('computing');
    expect(names(computing.preview)).toEqual([['a.com', 'domain']]);
    expect(computing.proposal).toBeUndefined();
    await organizer.abort();
    await running;
  });

  it('la proposta AI sostituisce l\'anteprima, che non resta nello stato', async () => {
    installFakeFetch(AI_GROUP);

    const state = await organizer.propose(W);

    expect(state.phase).toBe('ready');
    expect(names(state.proposal)).toEqual([['Lettura', 'ai']]);
    expect(state.preview).toBeUndefined();
  });

  it('"Usa questa" ferma l\'AI e rende l\'anteprima la proposta corrente, modificabile e applicabile', async () => {
    const { requests } = installFakeFetch(HANG);

    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const accepted = await organizer.acceptPreview();

    expect(requests[0]!.signal!.aborted).toBe(true);
    expect(await running).toEqual(accepted);
    expect(accepted.phase).toBe('ready');
    expect(accepted.notice).toBeUndefined();
    expect(names(accepted.proposal)).toEqual([['a.com', 'domain']]);

    const id = accepted.proposal!.groups[0]!.id;
    await organizer.edit({ kind: 'rename', groupId: id, name: 'Sito A' });
    await organizer.apply();
    expect(strip.groupsIn().map((g) => [g.title, g.tabs])).toEqual([['Sito A', ['A1', 'A2']]]);
  });

  it('dopo "Usa questa" la proposta resta attuale: riaprendo il pannello non si interroga di nuovo l\'AI', async () => {
    const { requests } = installFakeFetch(HANG);
    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const accepted = await organizer.acceptPreview();
    await running;

    const reopened = await organizer.propose(W);

    expect(reopened).toEqual(accepted);
    expect(requests).toHaveLength(1);
  });

  it('"Interrompi" resta com\'era: nessuna proposta, nemmeno quella per sito', async () => {
    const { requests } = installFakeFetch(HANG);

    const running = organizer.propose(W);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await organizer.abort();
    const state = await running;

    expect(state.phase).toBe('idle');
    expect(state.proposal).toBeUndefined();
    expect(state.preview).toBeUndefined();
    expect(state.notice).toEqual({ key: 'popupAborted' });
  });

  it('"Usa questa" senza un calcolo in corso non cambia nulla', async () => {
    installFakeFetch(AI_GROUP);
    const before = await organizer.propose(W);

    expect(await organizer.acceptPreview()).toEqual(before);
  });

  it('un calcolo ancora in coda, senza anteprima, finisce come con "Interrompi"', async () => {
    strip.addTab({ url: 'https://c.com/1', title: 'C1', windowId: 2 });
    strip.addTab({ url: 'https://c.com/2', title: 'C2', windowId: 2 });
    const { requests } = installFakeFetch(HANG);

    const first = organizer.propose(W);
    const queued = organizer.propose(2);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await organizer.acceptPreview();

    expect((await first).phase).toBe('ready');
    const second = await queued;
    expect(second.proposal).toBeUndefined();
    expect(second.notice).toEqual({ key: 'popupAborted' });
  });

  it('nessuna anteprima in modalità per sito: la proposta è già immediata', async () => {
    await saveSettings({ mode: 'domain' });

    await organizer.propose(W);

    expect(announced.some((s) => s.preview)).toBe(false);
  });

  it('nessuna anteprima se nessun livello AI è utilizzabile', async () => {
    await saveSettings({ generator: NO_PROVIDER });

    const state = await organizer.propose(W);

    expect(announced.some((s) => s.preview)).toBe(false);
    expect(names(state.proposal)).toEqual([['a.com', 'domain']]);
  });
});

describe('tempi del calcolo', () => {
  it('la proposta AI riporta la durata di lettura, anteprima, Generatore e il totale', async () => {
    installFakeFetch(AI_GROUP);

    const { proposal } = await organizer.propose(W);

    expect(Object.keys(proposal!.timings!).sort()).toEqual(['descriptions', 'generator', 'inputs', 'preview', 'total']);
    expect(Object.values(proposal!.timings!).every((ms) => Number.isInteger(ms) && ms >= 0)).toBe(true);
  });

  it('se il Generatore fallisce, si misurano sia il Generatore sia il ripiego per dominio', async () => {
    installFakeFetch(openAiReply('non json'));

    const { proposal } = await organizer.propose(W);

    expect(proposal!.timings).toHaveProperty('generator');
    expect(proposal!.timings).toHaveProperty('domain');
  });

  it('in modalità per sito si misurano solo la lettura del browser e il dominio', async () => {
    await saveSettings({ mode: 'domain' });

    const { proposal } = await organizer.propose(W);

    expect(Object.keys(proposal!.timings!).sort()).toEqual(['domain', 'inputs', 'preview', 'total']);
  });

  it('il cronometro assegna a ogni fase il tempo dall\'ultima chiusura e somma le fasi ripetute', () => {
    let now = 1000;
    const clock = createStopwatch(() => now);
    now += 12.4;
    clock.lap('inputs');
    now += 300;
    clock.lap('generator');
    now += 50;
    clock.lap('generator');

    expect(clock.timings()).toEqual({ inputs: 12, generator: 350, total: 362 });
  });
});
