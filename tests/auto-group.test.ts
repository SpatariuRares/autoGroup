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

describe('raggruppamento automatico con le regole sui siti', () => {
  it('è attivo di default', async () => {
    expect((await loadSettings()).autoGroupSites).toBe(true);
  });

  it('una tab di un sito entra nel gruppo aperto della sua categoria, anche da sola, senza cambiarne nome e colore', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    await strip.addGroup('dev', 'pink', [mine]);
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'dev', color: 'pink', tabs: ['Mia', 'Repo'] })]);
  });

  it('vale anche per una tab ancora in caricamento, senza titolo', async () => {
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    await strip.addGroup('Dev', 'grey', [mine]);
    const loading = strip.addTab({ url: 'https://github.com/a/b' });

    await organizer.autoGroupTab(loading);

    expect(strip.groupsIn()[0]!.tabs).toHaveLength(2);
  });

  it('senza gruppo aperto e sotto il minimo la tab resta libera', async () => {
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()).toEqual([]);
  });

  it('raggiunto il minimo crea il gruppo della categoria con le tab libere dello stesso sito', async () => {
    strip.addTab({ url: 'https://github.com/a/b', title: 'Repo 1' });
    strip.addTab({ url: 'https://news.ycombinator.com/', title: 'HN' });
    strip.addTab({ url: 'https://github.com/mia-org/x', title: 'Org' });
    const second = strip.addTab({ url: 'https://gist.github.com/c', title: 'Gist' });

    await organizer.autoGroupTab(second);

    // "Org" segue la regola più specifica (Work), quindi non entra in Dev.
    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'Dev', color: 'grey', tabs: ['Repo 1', 'Gist'] })]);
    expect(strip.layout()).toEqual(['Repo 1 [Dev]', 'Gist [Dev]', 'HN', 'Org']);
  });

  it('usa il minimo delle impostazioni', async () => {
    await saveSettings({ minTabs: 1 });
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'Dev', tabs: ['Repo'] })]);
  });

  it('non tocca tab fissate, già in un gruppo, di domini esclusi o senza regola', async () => {
    await saveSettings({ minTabs: 1, excludedDomains: ['gist.github.com'] });
    const pinned = strip.addTab({ url: 'https://github.com/p', title: 'Fissata', pinned: true });
    const grouped = strip.addTab({ url: 'https://github.com/g', title: 'In gruppo' });
    await strip.addGroup('Mio', 'red', [grouped]);
    const excluded = strip.addTab({ url: 'https://gist.github.com/e', title: 'Esclusa' });
    const other = strip.addTab({ url: 'https://example.com/', title: 'Altro' });

    for (const id of [pinned, grouped, excluded, other]) await organizer.autoGroupTab(id);

    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'Mio', tabs: ['In gruppo'] })]);
  });

  it('una tab libera non viene presa se il gruppo della categoria è in un\'altra finestra', async () => {
    const elsewhere = strip.addTab({ url: 'https://x.com/', title: 'Altrove', windowId: 2 });
    await strip.addGroup('Dev', 'grey', [elsewhere]);
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn(W)).toEqual([]);
  });

  it('con l\'interruttore spento non fa nulla', async () => {
    await saveSettings({ autoGroupSites: false });
    const mine = strip.addTab({ url: 'https://x.com/', title: 'Mia' });
    await strip.addGroup('Dev', 'grey', [mine]);
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()[0]!.tabs).toEqual(['Mia']);
  });

  it('funziona anche in modalità AI, senza interrogare nessun provider', async () => {
    await saveSettings({ mode: 'ai', minTabs: 1 });
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });

    await organizer.autoGroupTab(repo);

    expect(strip.groupsIn()).toEqual([expect.objectContaining({ title: 'Dev', tabs: ['Repo'] })]);
  });

  it('una tab chiusa nel frattempo è ignorata senza errori', async () => {
    const repo = strip.addTab({ url: 'https://github.com/a/b', title: 'Repo' });
    await strip.closeTab(repo);

    await expect(organizer.autoGroupTab(repo)).resolves.toBeUndefined();
  });

  it('cambiare l\'interruttore non rende superata la proposta', async () => {
    strip.addTab({ url: 'https://example.com/1', title: 'Uno' });
    strip.addTab({ url: 'https://example.com/2', title: 'Due' });
    const first = await organizer.propose(W);

    await saveSettings({ autoGroupSites: false });

    expect((await organizer.propose(W)).proposal!.createdAt).toBe(first.proposal!.createdAt);
  });
});
