import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ mode: 'domain', excludedDomains: ['banca.it'] });
});

/** La vista che il pannello mostra: tab e gruppi dal vivo più la proposta corrente. */
async function view() {
  const v = await organizer.view(W);
  return {
    existing: v.existing.map((e) => ({ name: e.group.name, current: e.current.map((t) => t.title), added: e.added.map((t) => t.title) })),
    created: v.created.map((g) => ({ name: g.name, tabs: g.tabs.map((t) => t.title) })),
    free: v.free.map((t) => t.title),
    held: v.held.map(({ tab, reason }) => `${tab.title}: ${reason}`),
  };
}

describe('vista della finestra nel pannello', () => {
  it('mostra gruppi aperti con le loro tab, gruppi nuovi, tab libere e tab mai toccate', async () => {
    const mine = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    await strip.addGroup('Lavoro', 'blue', [mine]);
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    strip.addTab({ url: 'https://news.com/', title: 'Fissata', pinned: true });
    strip.addTab({ url: 'chrome://settings/', title: 'Impostazioni' });
    strip.addTab({ url: 'https://banca.it/conto', title: 'Conto' });

    await organizer.propose(W);

    expect(await view()).toEqual({
      existing: [{ name: 'Lavoro', current: ['Doc 1'], added: [] }],
      created: [{ name: 'a.com', tabs: ['A1', 'A2'] }],
      free: ['Solo'],
      held: ['Fissata: pinned', 'Impostazioni: internal', 'Conto: excluded'],
    });
  });

  it('senza proposta mostra comunque tutta la finestra', async () => {
    const mine = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    await strip.addGroup('Lavoro', 'blue', [mine]);
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });

    expect(await view()).toEqual({ existing: [{ name: 'Lavoro', current: ['Doc 1'], added: [] }], created: [], free: ['A1'], held: [] });
  });
});

describe('"add-tab": mettere una tab libera in un gruppo', () => {
  it('in un gruppo nuovo della proposta, togliendola dagli altri', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const proposed = await organizer.propose(W);
    const groupId = proposed.proposal!.groups[0]!.id;

    const state = await organizer.edit({ kind: 'add-tab', tab: { tabId: solo, title: 'falso', url: 'https://x' }, to: { groupId } });

    expect((await view()).created).toEqual([{ name: 'a.com', tabs: ['A1', 'A2', 'Solo'] }]);
    // I dati della tab vengono dal browser, non dal messaggio.
    expect(state.proposal!.groups[0]!.tabs.at(-1)).toMatchObject({ title: 'Solo', url: 'https://solo.com/' });
  });

  it('in un gruppo già aperto che la proposta non toccava: diventa un gruppo "esistente" della proposta', async () => {
    const mine = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const chromeGroup = await strip.addGroup('Lavoro', 'blue', [mine]);
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    await organizer.propose(W);

    const state = await organizer.edit({
      kind: 'add-tab',
      tab: { tabId: solo, title: 'Solo', url: 'https://solo.com/' },
      to: { existingGroup: { id: chromeGroup, name: 'Lavoro', color: 'blue' } },
    });

    expect(state.proposal!.groups).toMatchObject([{ provenance: 'existing', existingGroupId: chromeGroup, tabs: [{ title: 'Solo' }] }]);
    expect((await view()).existing).toEqual([{ name: 'Lavoro', current: ['Doc 1'], added: ['Solo'] }]);
    await organizer.apply();
    expect(strip.groupsIn().map((g) => [g.title, g.tabs])).toEqual([['Lavoro', ['Doc 1', 'Solo']]]);
  });

  it('rifiuta tab fissate, già in un gruppo, di domini esclusi o di altre finestre', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const pinned = strip.addTab({ url: 'https://p.com/', title: 'P', pinned: true });
    const excluded = strip.addTab({ url: 'https://banca.it/', title: 'Banca' });
    const other = strip.addTab({ url: 'https://o.com/', title: 'Altra finestra', windowId: 2 });
    const mine = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    await strip.addGroup('Lavoro', 'blue', [mine]);
    const proposed = await organizer.propose(W);
    const groupId = proposed.proposal!.groups[0]!.id;

    for (const tabId of [pinned, excluded, other, mine]) {
      const state = await organizer.edit({ kind: 'add-tab', tab: { tabId, title: 'x', url: 'https://x' }, to: { groupId } });
      expect(state.proposal).toEqual(proposed.proposal);
    }
  });

  it('rifiuta un gruppo "esistente" di un\'altra finestra', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const elsewhere = strip.addTab({ url: 'https://o.com/', title: 'O', windowId: 2 });
    const otherGroup = await strip.addGroup('Altrove', 'red', [elsewhere]);
    const proposed = await organizer.propose(W);

    const state = await organizer.edit({
      kind: 'add-tab',
      tab: { tabId: solo, title: 'Solo', url: 'https://solo.com/' },
      to: { existingGroup: { id: otherGroup, name: 'Altrove', color: 'red' } },
    });

    expect(state.proposal).toEqual(proposed.proposal);
  });
});

describe('"Nuovo gruppo" da "Sposta in…"', () => {
  it('con la proposta crea un gruppo nuovo col nome del sito e un colore non ancora usato', async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    await strip.addGroup('Lavoro', 'grey', [d1]);
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const solo = strip.addTab({ url: 'https://www.solo.com/', title: 'Solo' });
    const proposed = await organizer.propose(W);
    const used = [proposed.proposal!.groups[0]!.color, 'grey'];

    const state = await organizer.edit({ kind: 'add-tab', tab: { tabId: solo, title: 'Solo', url: 'https://www.solo.com/' }, to: { newGroup: true } });

    const created = state.proposal!.groups.at(-1)!;
    expect(created).toMatchObject({ name: 'solo.com', provenance: 'manual', tabs: [{ title: 'Solo' }] });
    expect(used).not.toContain(created.color);
    await organizer.apply();
    expect(strip.groupsIn().map((g) => [g.title, g.tabs])).toContainEqual(['solo.com', ['Solo']]);
  });

  it('sposta in un gruppo nuovo anche una tab già nella proposta; due gruppi nuovi restano distinti', async () => {
    const a1 = strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    const a2 = strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://a.com/3', title: 'A3' });
    await organizer.propose(W);

    await organizer.edit({ kind: 'add-tab', tab: { tabId: a1, title: 'A1', url: 'https://a.com/1' }, to: { newGroup: true } });
    const state = await organizer.edit({ kind: 'add-tab', tab: { tabId: a2, title: 'A2', url: 'https://a.com/2' }, to: { newGroup: true } });

    expect(state.proposal!.groups.map((g) => g.tabs.map((t) => t.title))).toEqual([['A3'], ['A1'], ['A2']]);
    expect(new Set(state.proposal!.groups.map((g) => g.id)).size).toBe(3);
  });

  it('senza proposta crea subito in Chrome un gruppo col nome del sito, senza toccare lo stato', async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    await strip.addGroup('Lavoro', 'grey', [d1]);
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const before = await organizer.state();

    const state = await organizer.newGroup(solo);

    expect(strip.layout()).toEqual(['Doc 1 [Lavoro]', 'Solo [solo.com]']);
    expect(strip.groupsIn().find((g) => g.title === 'solo.com')!.color).not.toBe('grey');
    expect(state).toEqual(before);
  });

  it('senza proposta non tocca tab fissate o escluse senza gruppo', async () => {
    const pinned = strip.addTab({ url: 'https://p.com/', title: 'Fissata', pinned: true });
    const excluded = strip.addTab({ url: 'https://banca.it/', title: 'Banca' });

    for (const tabId of [pinned, excluded]) await organizer.newGroup(tabId);

    expect(strip.layout()).toEqual(['Fissata', 'Banca']);
  });

  it('trascinata fuori da un gruppo aperto, la tab finisce in un gruppo nuovo subito dopo', async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const d2 = strip.addTab({ url: 'https://docs.com/2', title: 'Doc 2' });
    const d3 = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    await strip.addGroup('Lavoro', 'blue', [d1, d2, d3]);
    strip.addTab({ url: 'https://x.com/', title: 'X' });

    await organizer.newGroup(d2);

    expect(strip.layout()).toEqual(['Doc 1 [Lavoro]', 'Solo [Lavoro]', 'Doc 2 [docs.com]', 'X']);
  });
});

describe('"Chiudi tab" dal pannello', () => {
  it('chiude una tab della proposta e la toglie; la proposta resta valida senza ricalcolo', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const a3 = strip.addTab({ url: 'https://a.com/3', title: 'A3' });
    await organizer.propose(W);

    const state = await organizer.closeTab(a3);

    expect(strip.layout()).toEqual(['A1', 'A2']);
    expect(state.proposal!.groups.map((g) => g.tabs.map((t) => t.title))).toEqual([['A1', 'A2']]);
    // Riaprendo il pannello la proposta (con la modifica) viene riusata: nessun nuovo calcolo.
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
  });

  it('chiude anche tab libere, fissate o dentro un gruppo aperto, senza toccare la proposta', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const pinned = strip.addTab({ url: 'https://p.com/', title: 'Fissata', pinned: true });
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const d2 = strip.addTab({ url: 'https://docs.com/2', title: 'Doc 2' });
    await strip.addGroup('Lavoro', 'blue', [d1, d2]);
    const proposed = await organizer.propose(W);

    for (const tabId of [solo, pinned, d1]) await organizer.closeTab(tabId);

    expect(strip.layout()).toEqual(['A1', 'A2', 'Doc 2 [Lavoro]']);
    expect((await createOrganizer().propose(W)).proposal).toEqual((await organizer.state()).proposal);
    expect((await organizer.state()).proposal!.groups).toEqual(proposed.proposal!.groups);
  });

  it("se chiude l'ultima tab di un gruppo aperto che la proposta estende, scarta l'estensione e resta attuale", async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const chromeGroup = await strip.addGroup('docs.com', 'blue', [d1]);
    strip.addTab({ url: 'https://docs.com/2', title: 'Doc 2' });
    const proposed = await organizer.propose(W);
    expect(proposed.proposal!.groups[0]!.existingGroupId).toBe(chromeGroup);

    const state = await organizer.closeTab(d1);

    expect(state.proposal!.groups).toEqual([]);
    expect((await view()).free).toEqual(['Doc 2']);
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
  });

  it('una tab già chiusa non cambia nulla', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    const gone = strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const proposed = await organizer.propose(W);
    await strip.closeTab(gone);

    expect(await organizer.closeTab(gone)).toEqual(proposed);
  });
});

describe('"Sposta in…" senza proposta', () => {
  it('mette subito una tab libera in un gruppo aperto, senza toccare lo stato', async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const lavoro = await strip.addGroup('Lavoro', 'blue', [d1]);
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const before = await organizer.state();

    const state = await organizer.groupTab(solo, lavoro);

    expect(strip.layout()).toEqual(['Doc 1 [Lavoro]', 'Solo [Lavoro]']);
    expect(state).toEqual(before);
  });

  it('non tocca tab fissate, già in un gruppo o gruppi di altre finestre', async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const lavoro = await strip.addGroup('Lavoro', 'blue', [d1]);
    const pinned = strip.addTab({ url: 'https://p.com/', title: 'Fissata', pinned: true });
    const elsewhere = strip.addTab({ url: 'https://x.com/', title: 'Altrove', windowId: W + 1 });
    const other = await strip.addGroup('Altro', 'red', [elsewhere]);
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });

    await organizer.groupTab(pinned, lavoro);
    await organizer.groupTab(solo, other);
    await organizer.groupTab(d1, lavoro);

    expect(strip.layout()).toEqual(['Doc 1 [Lavoro]', 'Fissata', 'Solo']);
  });
});
