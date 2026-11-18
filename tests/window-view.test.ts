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

/** The view the panel shows: live tabs and groups plus the current proposal. */
async function view() {
  const v = await organizer.view(W);
  return {
    existing: v.existing.map((e) => ({ name: e.group.name, current: e.current.map((t) => t.title), added: e.added.map((t) => t.title) })),
    created: v.created.map((g) => ({ name: g.name, tabs: g.tabs.map((t) => t.title) })),
    free: v.free.map((t) => t.title),
    held: v.held.map(({ tab, reason }) => `${tab.title}: ${reason}`),
  };
}

describe('window view in the panel', () => {
  it('shows open groups with their tabs, new groups, free tabs and untouched tabs', async () => {
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

  it('without a proposal it still shows the whole window', async () => {
    const mine = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    await strip.addGroup('Lavoro', 'blue', [mine]);
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });

    expect(await view()).toEqual({ existing: [{ name: 'Lavoro', current: ['Doc 1'], added: [] }], created: [], free: ['A1'], held: [] });
  });
});

describe('"add-tab": putting a free tab into a group', () => {
  it('into a new group of the proposal, removing it from the others', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const proposed = await organizer.propose(W);
    const groupId = proposed.proposal!.groups[0]!.id;

    const state = await organizer.edit({ kind: 'add-tab', tab: { tabId: solo, title: 'falso', url: 'https://x' }, to: { groupId } });

    expect((await view()).created).toEqual([{ name: 'a.com', tabs: ['A1', 'A2', 'Solo'] }]);
    // The tab data comes from the browser, not from the message.
    expect(state.proposal!.groups[0]!.tabs.at(-1)).toMatchObject({ title: 'Solo', url: 'https://solo.com/' });
  });

  it('into an already open group that the proposal did not touch: it becomes an "existing" group of the proposal', async () => {
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

  it('rejects tabs that are pinned, already in a group, from excluded domains or from other windows', async () => {
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

  it('rejects an "existing" group from another window', async () => {
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

describe('"New group" from "Move to…"', () => {
  it('with the proposal it creates a new group named after the site and a color not yet used', async () => {
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

  it('also moves into a new group a tab already in the proposal; two new groups stay distinct', async () => {
    const a1 = strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    const a2 = strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://a.com/3', title: 'A3' });
    await organizer.propose(W);

    await organizer.edit({ kind: 'add-tab', tab: { tabId: a1, title: 'A1', url: 'https://a.com/1' }, to: { newGroup: true } });
    const state = await organizer.edit({ kind: 'add-tab', tab: { tabId: a2, title: 'A2', url: 'https://a.com/2' }, to: { newGroup: true } });

    expect(state.proposal!.groups.map((g) => g.tabs.map((t) => t.title))).toEqual([['A3'], ['A1'], ['A2']]);
    expect(new Set(state.proposal!.groups.map((g) => g.id)).size).toBe(3);
  });

  it('without a proposal creates a group named after the site in Chrome right away, without touching the state', async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    await strip.addGroup('Lavoro', 'grey', [d1]);
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const before = await organizer.state();

    const state = await organizer.newGroup(solo);

    expect(strip.layout()).toEqual(['Doc 1 [Lavoro]', 'Solo [solo.com]']);
    expect(strip.groupsIn().find((g) => g.title === 'solo.com')!.color).not.toBe('grey');
    expect(state).toEqual(before);
  });

  it('without a proposal does not touch pinned tabs or excluded tabs without a group', async () => {
    const pinned = strip.addTab({ url: 'https://p.com/', title: 'Fissata', pinned: true });
    const excluded = strip.addTab({ url: 'https://banca.it/', title: 'Banca' });

    for (const tabId of [pinned, excluded]) await organizer.newGroup(tabId);

    expect(strip.layout()).toEqual(['Fissata', 'Banca']);
  });

  it('dragged out of an open group, the tab ends up in a new group right after', async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const d2 = strip.addTab({ url: 'https://docs.com/2', title: 'Doc 2' });
    const d3 = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    await strip.addGroup('Lavoro', 'blue', [d1, d2, d3]);
    strip.addTab({ url: 'https://x.com/', title: 'X' });

    await organizer.newGroup(d2);

    expect(strip.layout()).toEqual(['Doc 1 [Lavoro]', 'Solo [Lavoro]', 'Doc 2 [docs.com]', 'X']);
  });
});

describe('"Close tab" from the panel', () => {
  it('closes a tab of the proposal and removes it; the proposal stays valid without recomputing', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const a3 = strip.addTab({ url: 'https://a.com/3', title: 'A3' });
    await organizer.propose(W);

    const state = await organizer.closeTab(a3);

    expect(strip.layout()).toEqual(['A1', 'A2']);
    expect(state.proposal!.groups.map((g) => g.tabs.map((t) => t.title))).toEqual([['A1', 'A2']]);
    // Reopening the panel reuses the proposal (with the change): no new computation.
    expect((await createOrganizer().propose(W)).proposal).toEqual(state.proposal);
  });

  it('also closes free, pinned or open-group tabs, without touching the proposal', async () => {
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

  it("if it closes the last tab of an open group that the proposal extends, it discards the extension and stays current", async () => {
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

  it('a tab already closed changes nothing', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    const gone = strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const proposed = await organizer.propose(W);
    await strip.closeTab(gone);

    expect(await organizer.closeTab(gone)).toEqual(proposed);
  });
});

describe('"Move to…" without a proposal', () => {
  it('immediately puts a free tab into an open group, without touching the state', async () => {
    const d1 = strip.addTab({ url: 'https://docs.com/1', title: 'Doc 1' });
    const lavoro = await strip.addGroup('Lavoro', 'blue', [d1]);
    const solo = strip.addTab({ url: 'https://solo.com/', title: 'Solo' });
    const before = await organizer.state();

    const state = await organizer.groupTab(solo, lavoro);

    expect(strip.layout()).toEqual(['Doc 1 [Lavoro]', 'Solo [Lavoro]']);
    expect(state).toEqual(before);
  });

  it('does not touch pinned tabs, tabs already in a group or groups from other windows', async () => {
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
