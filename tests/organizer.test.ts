import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { DEFAULT_SETTINGS, loadSettings, normalizeDomain, resetCategories, saveSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
});

/** Names of the proposed groups with the titles of their tabs. */
async function proposedGroups(windowId = W) {
  const state = await organizer.propose(windowId);
  return state.proposal!.groups.map((g) => ({ name: g.name, tabs: g.tabs.map((t) => t.title) }));
}

describe('proposal by domain', () => {
  it('groups the tabs of the same domain, with a name without "www." and domain provenance', async () => {
    strip.addTab({ url: 'https://www.github.com/a', title: 'GH A' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN' });
    strip.addTab({ url: 'https://github.com/b?x=1#y', title: 'GH B' });

    const state = await organizer.propose(W);

    expect(state.phase).toBe('ready');
    expect(state.proposal!.groups).toMatchObject([
      { name: 'github.com', provenance: 'domain', tabs: [{ title: 'GH A' }, { title: 'GH B' }] },
    ]);
  });

  it('does not create groups of a single tab', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });

    expect(await proposedGroups()).toEqual([]);
  });

  it('considers only the free, real tabs of the current window', async () => {
    strip.addTab({ url: 'https://site.com/pinned', title: 'Fissata', pinned: true });
    strip.addTab({ url: 'https://site.com/other-window', title: 'Altra finestra', windowId: 2 });
    const inGroup = strip.addTab({ url: 'https://site.com/grouped', title: 'Già raggruppata' });
    await strip.addGroup('Mio', 'blue', [inGroup]);
    strip.addTab({ url: 'chrome://newtab/', title: 'Nuova scheda' });
    strip.addTab({ url: 'chrome-extension://abc/page.html', title: 'Estensione' });
    strip.addTab({ url: 'https://site.com/loading', title: '' });
    strip.addTab({ url: 'https://site.com/loading2', title: 'https://site.com/loading2' });
    strip.addTab({ url: 'https://site.com/1', title: 'Uno' });
    strip.addTab({ url: 'https://site.com/2', title: 'Due' });

    expect(await proposedGroups()).toEqual([{ name: 'site.com', tabs: ['Uno', 'Due'] }]);
  });

  it('adds the tabs of a site to the open group with the same name, even a single one', async () => {
    const mine = strip.addTab({ url: 'https://github.com/old', title: 'Vecchia' });
    const chromeGroup = await strip.addGroup('GitHub.com', 'green', [mine]);
    strip.addTab({ url: 'https://github.com/new', title: 'Nuova' });
    strip.addTab({ url: 'https://solo.com/', title: 'Sola' });

    const { proposal } = await organizer.propose(W);

    expect(proposal!.groups).toMatchObject([
      { name: 'GitHub.com', color: 'green', provenance: 'existing', existingGroupId: chromeGroup, tabs: [{ title: 'Nuova' }] },
    ]);
    await organizer.apply();
    expect(strip.groupsIn().map((g) => [g.title, g.tabs])).toEqual([['GitHub.com', ['Vecchia', 'Nuova']]]);
  });

  it('assigns the new groups the colors not yet used in the window, in rotation', async () => {
    const mine = strip.addTab({ url: 'https://mine.com/', title: 'Mia' });
    await strip.addGroup('Mio', 'grey', [mine]);
    for (const site of ['a.com', 'b.com', 'c.com']) {
      strip.addTab({ url: `https://${site}/1`, title: `${site} 1` });
      strip.addTab({ url: `https://${site}/2`, title: `${site} 2` });
    }

    const { proposal } = await organizer.propose(W);

    expect(proposal!.groups.map((g) => g.color)).toEqual(['blue', 'red', 'yellow']);
  });

  it('does not move or group any tab before "Apply"', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const before = strip.layout();

    await organizer.propose(W);

    expect(strip.layout()).toEqual(before);
    expect(strip.groupsIn()).toEqual([]);
  });

  it('keeps the proposal in the session state, so the panel finds it again', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    const first = await organizer.propose(W);
    // A new Organizer simulates the service worker restarting or the panel being reopened.
    const reopened = createOrganizer();
    const state = await reopened.state();

    expect(state.phase).toBe('ready');
    expect(state.proposal).toEqual(first.proposal);
    expect(await reopened.propose(W)).toEqual(first);
  });

  it('recognizes a computation in progress: two requests together produce a single proposal', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    const [a, b] = await Promise.all([organizer.propose(W), organizer.propose(W)]);

    expect(a.proposal!.createdAt).toBe(b.proposal!.createdAt);
  });
});

describe('apply', () => {
  it('creates in Chrome exactly the groups of the proposal, with name and color', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    strip.addTab({ url: 'https://c.com/1', title: 'C1' });

    await organizer.propose(W);
    const state = await organizer.apply();

    expect(state.phase).toBe('idle');
    expect(strip.groupsIn().map(({ title, color, tabs }) => ({ title, color, tabs }))).toEqual([
      { title: 'a.com', color: 'grey', tabs: ['A1', 'A2'] },
      { title: 'b.com', color: 'blue', tabs: ['B1', 'B2'] },
    ]);
    expect(strip.layout()).toContain('C1');
  });

  it('does not touch the groups already open', async () => {
    const mine = strip.addTab({ url: 'https://a.com/mine', title: 'Mia' });
    await strip.addGroup('Mio', 'red', [mine]);
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    await organizer.propose(W);
    await organizer.apply();

    expect(strip.groupsIn().map(({ title, color, tabs }) => ({ title, color, tabs }))).toEqual([
      { title: 'Mio', color: 'red', tabs: ['Mia'] },
      { title: 'a.com', color: 'grey', tabs: ['A1', 'A2'] },
    ]);
  });

  it('skips the tabs closed between the proposal and "Apply"', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    const closed = strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://a.com/3', title: 'A3' });

    await organizer.propose(W);
    await strip.closeTab(closed);
    await organizer.apply();

    expect(strip.groupsIn().map((g) => g.tabs)).toEqual([['A1', 'A3']]);
  });

  it('after "Apply" the proposal is no longer there and a new opening recomputes', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    await organizer.propose(W);
    await organizer.apply();

    expect((await organizer.state()).proposal).toBeUndefined();
    expect(await proposedGroups()).toEqual([]);
  });
});

describe('undo', () => {
  /** Mixed strip: pinned tab, the user's group, free tabs of two domains and a single tab. */
  async function mixedStrip() {
    strip.addTab({ url: 'https://pinned.com/', title: 'Fissata', pinned: true });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    const mine = strip.addTab({ url: 'https://mine.com/', title: 'Mia' });
    await strip.addGroup('Mio', 'red', [mine]);
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://c.com/1', title: 'C1' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    strip.addTab({ url: 'https://a.com/3', title: 'A3' });
  }

  it('is not available before "Apply", it is after', async () => {
    await mixedStrip();

    expect((await organizer.propose(W)).undo).toBeUndefined();
    expect((await organizer.apply()).undo).toBeDefined();
  });

  it('restores every tab to its original position and group and dissolves the groups created', async () => {
    await mixedStrip();
    const before = strip.layout();

    await organizer.propose(W);
    await organizer.apply();
    expect(strip.layout()).not.toEqual(before);
    const state = await organizer.undo();

    expect(strip.layout()).toEqual(before);
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Mio']);
    expect(state.undo).toBeUndefined();
  });

  it('ignores the tabs closed in the meantime', async () => {
    await mixedStrip();
    const before = strip.layout();
    await organizer.propose(W);
    await organizer.apply();

    const a2 = (await fakeBrowser.tabs.query({})).find((t) => t.title === 'A2')!;
    await strip.closeTab(a2.id!);
    const state = await organizer.undo();

    expect(state.error).toBeUndefined();
    expect(strip.layout()).toEqual(before.filter((t) => t !== 'A2'));
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Mio']);
  });

  it('does not touch the tabs opened afterwards', async () => {
    await mixedStrip();
    const before = strip.layout();
    await organizer.propose(W);
    await organizer.apply();

    strip.addTab({ url: 'https://new.com/', title: 'Nuova' });
    await organizer.undo();

    expect(strip.layout()).toEqual([...before, 'Nuova']);
  });

  it('does not rename back the groups renamed by the user', async () => {
    await mixedStrip();
    await organizer.propose(W);
    await organizer.apply();

    const [mio] = await fakeBrowser.tabGroups.query({ title: 'Mio' });
    await fakeBrowser.tabGroups.update(mio!.id, { title: 'Rinominato' });
    await organizer.undo();

    expect(strip.groupsIn().map((g) => g.title)).toEqual(['Rinominato']);
  });

  it('stays available after a new proposal and applies only to the last operation', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    await organizer.propose(W);
    await organizer.apply();
    const afterFirst = strip.layout();

    // Reopening the panel computes a new proposal: the undo stays.
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    const reopened = await organizer.propose(W);
    expect(reopened.undo).toBeDefined();

    await organizer.apply();
    await organizer.undo();

    // Back to the state after the first organization, not to the initial one.
    expect(strip.layout()).toEqual([...afterFirst, 'B1', 'B2'].filter((t, i, all) => all.indexOf(t) === i));
    expect(strip.groupsIn().map((g) => g.title)).toEqual(['a.com']);
    expect((await organizer.state()).undo).toBeUndefined();
  });
});

describe('editable preview', () => {
  /** Three domains with two tabs each: a.com, b.com, c.com. */
  async function threeDomains() {
    for (const site of ['a.com', 'b.com', 'c.com']) {
      strip.addTab({ url: `https://${site}/1`, title: `${site} 1` });
      strip.addTab({ url: `https://${site}/2`, title: `${site} 2` });
    }
    const { proposal } = await organizer.propose(W);
    const id = (name: string) => proposal!.groups.find((g) => g.name === name)!.id;
    const tab = (title: string) => proposal!.groups.flatMap((g) => g.tabs).find((t) => t.title === title)!.tabId;
    return { id, tab };
  }

  const appliedGroups = () => strip.groupsIn().map(({ title, color, tabs }) => ({ title, color, tabs }));

  it('"Apply" creates exactly the groups of the edited proposal', async () => {
    const { id, tab } = await threeDomains();

    await organizer.edit({ kind: 'rename', groupId: id('a.com'), name: '  Lavoro  ' });
    await organizer.edit({ kind: 'recolor', groupId: id('a.com'), color: 'purple' });
    await organizer.edit({ kind: 'move-tab', tabId: tab('b.com 1'), toGroupId: id('a.com') });
    await organizer.edit({ kind: 'remove-tab', tabId: tab('b.com 2') });
    await organizer.edit({ kind: 'discard-group', groupId: id('c.com') });
    await organizer.apply();

    expect(appliedGroups()).toEqual([{ title: 'Lavoro', color: 'purple', tabs: ['a.com 1', 'a.com 2', 'b.com 1'] }]);
    expect(strip.layout().filter((t) => !t.includes('['))).toEqual(['b.com 2', 'c.com 1', 'c.com 2']);
  });

  it('a group left without tabs disappears from the proposal', async () => {
    const { id, tab } = await threeDomains();

    await organizer.edit({ kind: 'move-tab', tabId: tab('b.com 1'), toGroupId: id('a.com') });
    const state = await organizer.edit({ kind: 'move-tab', tabId: tab('b.com 2'), toGroupId: id('c.com') });

    expect(state.proposal!.groups.map((g) => [g.name, g.tabs.map((t) => t.title)])).toEqual([
      ['a.com', ['a.com 1', 'a.com 2', 'b.com 1']],
      ['c.com', ['c.com 1', 'c.com 2', 'b.com 2']],
    ]);
  });

  it('the edits stay in the state, so they survive closing the panel', async () => {
    const { id } = await threeDomains();

    const edited = await organizer.edit({ kind: 'rename', groupId: id('b.com'), name: 'Video' });
    const reopened = await createOrganizer().propose(W);

    expect(reopened.proposal).toEqual(edited.proposal);
    expect(reopened.proposal!.groups.map((g) => g.name)).toEqual(['a.com', 'Video', 'c.com']);
  });

  it('ignores edits to groups or tabs that do not exist', async () => {
    const { id } = await threeDomains();
    const before = (await organizer.state()).proposal;

    await organizer.edit({ kind: 'rename', groupId: 'g99', name: 'X' });
    await organizer.edit({ kind: 'move-tab', tabId: 12345, toGroupId: id('a.com') });
    await organizer.edit({ kind: 'remove-tab', tabId: 12345 });

    expect((await organizer.state()).proposal).toEqual(before);
  });

  it('every group shows its provenance and its tabs', async () => {
    await threeDomains();
    const { proposal } = await organizer.state();

    for (const group of proposal!.groups) {
      expect(group.provenance).toBe('domain');
      expect(group.tabs.length).toBeGreaterThan(0);
    }
  });
});

describe('settings: behavior and excluded domains', () => {
  it('by default the minimum is 2 and there are no excluded domains, saved in storage.sync', async () => {
    expect(await loadSettings()).toMatchObject(DEFAULT_SETTINGS);
    await saveSettings({ minTabs: 4, excludedDomains: ['bank.com'] });
    expect(await fakeBrowser.storage.sync.get(['minTabs', 'excludedDomains'])).toEqual({
      minTabs: 4,
      excludedDomains: ['bank.com'],
    });
  });

  it('with a minimum of 3 tabs a domain with 2 tabs does not form a group', async () => {
    await saveSettings({ minTabs: 3 });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });
    strip.addTab({ url: 'https://b.com/3', title: 'B3' });

    expect(await proposedGroups()).toEqual([{ name: 'b.com', tabs: ['B1', 'B2', 'B3'] }]);
  });

  it('with a minimum of 1 even a single tab forms a group', async () => {
    await saveSettings({ minTabs: 1 });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });

    expect(await proposedGroups()).toEqual([
      { name: 'a.com', tabs: ['A1'] },
      { name: 'b.com', tabs: ['B1'] },
    ]);
  });

  it('the changed minimum applies to the following proposals', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    expect(await proposedGroups()).toHaveLength(1);

    await saveSettings({ minTabs: 3 });
    const { proposal } = await organizer.propose(W, { force: true });

    expect(proposal!.groups).toEqual([]);
  });

  it('rejects a minimum that is not an integer greater than or equal to 1', async () => {
    await expect(saveSettings({ minTabs: 0 })).rejects.toThrow();
    await expect(saveSettings({ minTabs: 1.5 })).rejects.toThrow();
    expect((await loadSettings()).minTabs).toBe(2);
  });

  it('the tabs of excluded domains and their subdomains stay out of the proposal', async () => {
    await saveSettings({ excludedDomains: ['google.com'] });
    strip.addTab({ url: 'https://mail.google.com/1', title: 'Posta 1' });
    strip.addTab({ url: 'https://mail.google.com/2', title: 'Posta 2' });
    strip.addTab({ url: 'https://www.google.com/search', title: 'Ricerca' });
    strip.addTab({ url: 'https://google.com/maps', title: 'Mappe' });
    strip.addTab({ url: 'https://notgoogle.com/1', title: 'Altro 1' });
    strip.addTab({ url: 'https://notgoogle.com/2', title: 'Altro 2' });

    expect(await proposedGroups()).toEqual([{ name: 'notgoogle.com', tabs: ['Altro 1', 'Altro 2'] }]);
  });

  it('the tabs of excluded domains stay free after "Apply"', async () => {
    await saveSettings({ excludedDomains: ['bank.com'] });
    strip.addTab({ url: 'https://bank.com/1', title: 'Banca 1' });
    strip.addTab({ url: 'https://bank.com/2', title: 'Banca 2' });
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    await organizer.propose(W);
    await organizer.apply();

    expect(strip.layout()).toEqual(['Banca 1', 'Banca 2', 'A1 [a.com]', 'A2 [a.com]']);
  });

  it('normalizes the domains written by the user', () => {
    expect(normalizeDomain('  https://www.Google.com/path?q=1 ')).toBe('google.com');
    expect(normalizeDomain('mail.google.com')).toBe('mail.google.com');
    expect(normalizeDomain('localhost:8080')).toBe('localhost');
    expect(normalizeDomain('')).toBeNull();
    expect(normalizeDomain('non un dominio')).toBeNull();
  });
});

describe('robustness (review AG-R1)', () => {
  it('a proposal requested while applying does not erase the snapshot for "Undo"', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const before = strip.layout();
    await organizer.propose(W);

    const [, reopened] = await Promise.all([organizer.apply(), organizer.propose(W, { force: true })]);

    expect(reopened.undo).toBeDefined();
    expect((await organizer.state()).undo).toBeDefined();
    await organizer.undo();
    expect(strip.layout()).toEqual(before);
  });

  it('reopening the panel recomputes if the free tabs have changed', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    await organizer.propose(W);

    strip.addTab({ url: 'https://b.com/1', title: 'B1' });
    strip.addTab({ url: 'https://b.com/2', title: 'B2' });

    expect(await proposedGroups()).toEqual([
      { name: 'a.com', tabs: ['A1', 'A2'] },
      { name: 'b.com', tabs: ['B1', 'B2'] },
    ]);
  });

  it('reopening the panel keeps the edited proposal if the free tabs have not changed', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const { proposal } = await organizer.propose(W);
    await organizer.edit({ kind: 'rename', groupId: proposal!.groups[0]!.id, name: 'Mio nome' });

    expect((await proposedGroups())[0]!.name).toBe('Mio nome');
  });

  it('the state always shows the window it refers to', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });

    expect((await organizer.propose(W)).windowId).toBe(W);
    expect((await organizer.apply()).windowId).toBe(W);
    expect((await organizer.undo()).windowId).toBe(W);
  });
});

describe('category catalog', () => {
  const names = async () => (await loadSettings()).categories.map((c) => c.name);

  it('on first launch there are the 10 predefined categories in Italian, with description and color', async () => {
    const { categories } = await loadSettings();

    expect(categories.map((c) => c.name)).toEqual([
      'Lavoro', 'Sviluppo', 'AI', 'Social', 'Notizie', 'Video', 'Shopping', 'Viaggi', 'Finanza', 'Studio',
    ]);
    for (const c of categories) {
      expect(c.description.length).toBeGreaterThan(10);
      expect(c.color).toMatch(/^(grey|blue|red|yellow|green|pink|purple|cyan|orange)$/);
    }
  });

  it('with the browser in English the predefined categories are in English', async () => {
    installFakeI18n('en');

    expect(await names()).toEqual([
      'Work', 'Dev', 'AI', 'Social', 'News', 'Video', 'Shopping', 'Travel', 'Finance', 'Study',
    ]);
  });

  it('categories can be added, edited, deleted and reordered, and the list goes to storage.sync', async () => {
    const { categories } = await loadSettings();
    const [work, dev, ...rest] = categories;
    const edited = [
      dev!,
      { ...work!, name: '  Ufficio ', color: 'red' as const },
      ...rest.filter((c) => c.name !== 'Shopping'),
      { id: 'mine', name: 'Cucina', description: 'Ricette e cucina', color: 'orange' as const },
    ];

    await saveSettings({ categories: edited });

    expect(await names()).toEqual([
      'Sviluppo', 'Ufficio', 'AI', 'Social', 'Notizie', 'Video', 'Viaggi', 'Finanza', 'Studio', 'Cucina',
    ]);
    expect((await loadSettings()).categories[1]!.color).toBe('red');
    const stored = await fakeBrowser.storage.sync.get('categories');
    expect((stored.categories as { name: string }[]).map((c) => c.name)).toEqual(await names());
  });

  it('rejects duplicate names regardless of case, and empty names', async () => {
    const { categories } = await loadSettings();

    await expect(
      saveSettings({ categories: [...categories, { id: 'x', name: 'lavoro ', description: '', color: 'red' }] }),
    ).rejects.toMatchObject({ messageKey: 'categoryNameDuplicate' });
    await expect(
      saveSettings({ categories: [...categories, { id: 'y', name: '   ', description: '', color: 'red' }] }),
    ).rejects.toMatchObject({ messageKey: 'categoryNameEmpty' });
    expect(await fakeBrowser.storage.sync.get('categories')).toEqual({});
  });

  it('"Restore defaults" brings back the initial list', async () => {
    await saveSettings({ categories: [{ id: 'mine', name: 'Cucina', description: '', color: 'orange' }] });
    expect(await names()).toEqual(['Cucina']);

    const restored = await resetCategories();

    expect(restored.map((c) => c.name)).toEqual(await names());
    expect(await names()).toHaveLength(10);
  });

  it('an empty list is allowed', async () => {
    await saveSettings({ categories: [] });

    expect(await names()).toEqual([]);
  });

  it('edited categories make a saved proposal no longer current', async () => {
    strip.addTab({ url: 'https://a.com/1', title: 'A1' });
    strip.addTab({ url: 'https://a.com/2', title: 'A2' });
    const first = await organizer.propose(W);

    await saveSettings({ categories: [] });
    const second = await organizer.propose(W);

    expect(second.proposal!.createdAt).toBeGreaterThanOrEqual(first.proposal!.createdAt);
    expect(second.proposal!.signature).not.toBe(first.proposal!.signature);
  });
});
