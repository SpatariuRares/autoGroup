import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSettings, normalizeSite, resetCategories, saveSettings, SettingsError, type CategorySites } from '../src/settings';
import type { Category } from '../src/shared/types';
import { createSiteMatcher, siteToRemember } from '../src/organizer/site-rules';
import { installFakeI18n } from './fake-i18n';

const CATS: Category[] = [
  { id: 'dev', name: 'Dev', description: '', color: 'grey' },
  { id: 'work', name: 'Work', description: '', color: 'blue' },
];

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
});

describe('normalizeSite', () => {
  it('reduces what the user types to domain[/path]', () => {
    expect(normalizeSite('https://www.GitHub.com/Mia-Org/')).toBe('github.com/mia-org');
    expect(normalizeSite('github.com')).toBe('github.com');
    expect(normalizeSite('  docs.google.com/document/d/x?usp=sharing#h  ')).toBe('docs.google.com/document/d/x');
    expect(normalizeSite('localhost:3000/app')).toBe('localhost/app');
  });

  it('rejects what is not a site', () => {
    for (const bad of ['', '   ', 'non un sito', 'http://', '-bad.com']) expect(normalizeSite(bad)).toBeNull();
  });
});

describe('category sites in the settings', () => {
  it('by default there are no sites; they are saved under a separate key of storage.sync', async () => {
    expect((await loadSettings()).categorySites).toEqual({});

    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'], work: ['github.com/mia-org'] } });

    expect((await loadSettings()).categorySites).toEqual({ dev: ['github.com'], work: ['github.com/mia-org'] });
    const stored = await fakeBrowser.storage.sync.get('categorySites');
    expect(stored.categorySites).toEqual({ dev: ['github.com'], work: ['github.com/mia-org'] });
  });

  it('rejects non-normalized sites and the same site in two categories', async () => {
    await saveSettings({ categories: CATS });

    await expect(saveSettings({ categorySites: { dev: ['https://GitHub.com'] } })).rejects.toThrow(SettingsError);
    await expect(saveSettings({ categorySites: { dev: ['github.com'], work: ['github.com'] } })).rejects.toMatchObject({
      messageKey: 'optionsSitesInvalid',
    });
  });

  it('rejects more sites than fit in the storage.sync quota', async () => {
    await saveSettings({ categories: CATS });
    const many = Array.from({ length: 400 }, (_, i) => `sito-numero-${i}.example.com`);

    await expect(saveSettings({ categorySites: { dev: many } })).rejects.toMatchObject({ messageKey: 'optionsSitesTooMany' });
  });

  it('removes the sites of deleted categories and empty lists', async () => {
    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'], work: ['jira.com'] } });

    await saveSettings({ categories: [CATS[1]!] });
    expect((await loadSettings()).categorySites).toEqual({ work: ['jira.com'] });

    await saveSettings({ categorySites: { work: [] } });
    expect((await loadSettings()).categorySites).toEqual({});
  });

  it('"Restore defaults" also clears the sites', async () => {
    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'] } });

    await resetCategories();

    expect((await loadSettings()).categorySites).toEqual({});
  });
});

describe('site rules', () => {
  const match = (url: string, sites: CategorySites) => createSiteMatcher(CATS, sites)(url);

  it('a domain also takes its subdomains, with or without www', () => {
    const sites = { work: ['atlassian.net'] };

    expect(match('https://team.atlassian.net/browse/X-1', sites)?.category.name).toBe('Work');
    expect(match('https://www.atlassian.net/', sites)?.site).toBe('atlassian.net');
    expect(match('https://notatlassian.net/', sites)).toBeNull();
  });

  it('a path is compared by whole segments, regardless of case', () => {
    const sites = { work: ['github.com/mia-org'] };

    expect(match('https://github.com/Mia-Org/repo?tab=1', sites)?.site).toBe('github.com/mia-org');
    expect(match('https://github.com/mia-org', sites)?.site).toBe('github.com/mia-org');
    expect(match('https://github.com/mia-organization', sites)).toBeNull();
    expect(match('https://github.com/', sites)).toBeNull();
  });

  it('the most specific rule wins, whatever the order of the categories', () => {
    const sites = { dev: ['github.com'], work: ['github.com/mia-org'] };

    expect(match('https://github.com/mia-org/x', sites)?.category.name).toBe('Work');
    expect(match('https://github.com/altro/x', sites)?.category.name).toBe('Dev');
  });

  it('with equal components the longer path wins', () => {
    const sites = { dev: ['a.google.com'], work: ['google.com/x'] };

    expect(match('https://a.google.com/x', sites)?.category.name).toBe('Work');
  });

  it('ignores pages without a domain and the sites of categories that do not exist', () => {
    expect(match('file:///Users/me/a.pdf', { dev: ['github.com'] })).toBeNull();
    expect(match('https://github.com/', { ghost: ['github.com'] })).toBeNull();
  });

  it('the site to remember is that of the rule that decides the tab, otherwise the domain', () => {
    const sites = { work: ['github.com/mia-org'] };

    expect(siteToRemember('https://github.com/mia-org/x', CATS, sites)).toBe('github.com/mia-org');
    expect(siteToRemember('https://www.github.com/altro', CATS, sites)).toBe('github.com');
    expect(siteToRemember('file:///a.pdf', CATS, sites)).toBeNull();
  });
});
