import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createOrganizer, type Organizer } from '../src/organizer';
import { loadSettings, saveSettings } from '../src/settings';
import type { Category } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';
import { installFakeTabStrip, type FakeTabStrip } from './fake-tab-strip';

let strip: FakeTabStrip;
let organizer: Organizer;
const W = 1;
const CATEGORIES: Category[] = [
  { id: 'dev', name: 'Dev', description: 'Programmazione', color: 'grey' },
  { id: 'work', name: 'Work', description: 'Lavoro', color: 'blue' },
];
const SITES = { dev: ['github.com'], work: ['github.com/mia-org'] };

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  strip = installFakeTabStrip({ currentWindowId: W });
  organizer = createOrganizer();
  await saveSettings({ mode: 'domain', categories: CATEGORIES, categorySites: SITES });
});

describe('automatic grouping with site rules', () => {
  it('is on by default', async () => {
    expect((await loadSettings()).autoGroupSites).toBe(true);
  });

  it('a site tab joins the open group of its category, even alone, without changing its name and color', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    await strip.addGroup('dev', 'pink', [mine]);
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'dev', color: 'pink', tabs: ['Mia', 'Repo'] })]);
  });

  it('also applies to a tab still loading, without a title', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    await strip.addGroup('Dev', 'grey', [mine]);
    const loading = strip.addTab({ url: 'https://github.com/a/b' });

    await organizer.autoGroupTab(loading);

    expect(strip.groupsIn()[0]!.tabs).toHaveLength(2);
  });

  it('without an open group and below the minimum the tab stays free', async () => {
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()).toEqual([]);
  });

  it('once the minimum is reached it creates the category\'s group with the free tabs of the same site', async () => {
    strip.addTab({ url: 'https://github.com/a/b', title: 'Repo 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN' });
    strip.addTab({ url: 'https://github.com/mia-org/x', title: 'Org' });
    const second = strip.addTab({ url: 'https://gist.github.com/c', title: 'Gist' });

    await organizer.autoGroupTab(second);

    // "Org" follows the most specific rule (Work), so it does not join Dev.
    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'Dev', color: 'grey', tabs: ['Repo 1', 'Gist'] })]);
    expect(strip.layout()).toEqual(['Repo 1 [Dev]', 'Gist [Dev]', 'HN', 'Org']);
  });

  it('uses the minimum from the settings', async () => {
    await saveSettings({ minTabs: 1 });
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'Dev', tabs: ['Repo'] })]);
  });

  it('does not touch pinned tabs, tabs already in a group, from excluded domains or without a rule', async () => {
    await saveSettings({ minTabs: 1, excludedDomains: ['gist.github.com'] });
    const pinned = strip.addTab({ url: 'https://github.com/p', title: 'Fissata', pinned: true });
    const grouped = strip.addTab({ url: 'https://github.com/g', title: 'In gruppo' });
    await strip.addGroup('Mio', 'red', [grouped]);
    const excluded = strip.addTab({ url: 'https://gist.github.com/e', title: 'Esclusa' });
    const other = strip.addTab({ url: 'https://example.com/', title: 'Altro' });

    for (const id of [pinned, grouped, excluded, other]) await organizer.autoGroupTab(id);

    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'Mio', tabs: ['In gruppo'] })]);
  });

  it('a free tab is not taken if the category\'s group is in another window', async () => {
    const elsewhere = strip.addTab({ url: 'https://x.com/', title: 'Altrove', windowId: 2 });
    await strip.addGroup('Dev', 'grey', [elsewhere]);
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn(W)).toEqual([]);
  });

  it('with the switch off it does nothing', async () => {
    await saveSettings({ autoGroupSites: false });
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    await strip.addGroup('Dev', 'grey', [mine]);
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()[0]!.tabs).toEqual(['Mia']);
  });

  it('also works in AI mode, without querying any provider', async () => {
    await saveSettings({ mode: 'ai', minTabs: 1 });
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'Dev', tabs: ['Repo'] })]);
  });

  it('a tab closed in the meantime is ignored without errors', async () => {
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });
    await strip.closeTab(repo);

    await expect(organizer.autoGroupTab(repo)).resolves.toBeUndefined();
  });

  it('changing the switch does not make the proposal stale', async () => {
    strip.addTab({ url: 'https://example.com/1', title: 'Uno' });
    strip.addTab({ url: 'https://example.com/2', title: 'Due' });
    const first = await organizer.propose(W);

    await saveSettings({ autoGroupSites: false });

    expect((await organizer.propose(W)).proposal!.createdAt).toBe(first.proposal!.createdAt);
  });
});
