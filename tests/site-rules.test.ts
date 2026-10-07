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
  it('riduce quello che scrive l\'utente a dominio[/percorso]', () => {
    expect(normalizeSite('https://www.GitHub.com/Mia-Org/')).toBe('github.com/mia-org');
    expect(normalizeSite('github.com')).toBe('github.com');
    expect(normalizeSite('  docs.google.com/document/d/x?usp=sharing#h  ')).toBe('docs.google.com/document/d/x');
    expect(normalizeSite('localhost:3000/app')).toBe('localhost/app');
  });

  it('rifiuta ciò che non è un sito', () => {
    for (const bad of ['', '   ', 'non un sito', 'http://', '-bad.com']) expect(normalizeSite(bad)).toBeNull();
  });
});

describe('siti delle categorie nelle impostazioni', () => {
  it('di default non ci sono siti; si salvano in una chiave a parte di storage.sync', async () => {
    expect((await loadSettings()).categorySites).toEqual({});

    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'], work: ['github.com/mia-org'] } });

    expect((await loadSettings()).categorySites).toEqual({ dev: ['github.com'], work: ['github.com/mia-org'] });
    const stored = await fakeBrowser.storage.sync.get('categorySites');
    expect(stored.categorySites).toEqual({ dev: ['github.com'], work: ['github.com/mia-org'] });
  });

  it('rifiuta siti non normalizzati e lo stesso sito in due categorie', async () => {
    await saveSettings({ categories: CATS });

    await expect(saveSettings({ categorySites: { dev: ['https://GitHub.com'] } })).rejects.toThrow(SettingsError);
    await expect(saveSettings({ categorySites: { dev: ['github.com'], work: ['github.com'] } })).rejects.toMatchObject({
      messageKey: 'optionsSitesInvalid',
    });
  });

  it('rifiuta più siti di quanti ne stanno nella quota di storage.sync', async () => {
    await saveSettings({ categories: CATS });
    const many = Array.from({ length: 400 }, (_, i) => `sito-numero-${i}.example.com`);

    await expect(saveSettings({ categorySites: { dev: many } })).rejects.toMatchObject({ messageKey: 'optionsSitesTooMany' });
  });

  it('toglie i siti delle categorie eliminate e le liste vuote', async () => {
    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'], work: ['jira.com'] } });

    await saveSettings({ categories: [CATS[1]!] });
    expect((await loadSettings()).categorySites).toEqual({ work: ['jira.com'] });

    await saveSettings({ categorySites: { work: [] } });
    expect((await loadSettings()).categorySites).toEqual({});
  });

  it('"Ripristina default" cancella anche i siti', async () => {
    await saveSettings({ categories: CATS, categorySites: { dev: ['github.com'] } });

    await resetCategories();

    expect((await loadSettings()).categorySites).toEqual({});
  });
});

describe('regole sui siti', () => {
  const match = (url: string, sites: CategorySites) => createSiteMatcher(CATS, sites)(url);

  it('un dominio prende anche i sottodomini, con o senza www', () => {
    const sites = { work: ['atlassian.net'] };

    expect(match('https://team.atlassian.net/browse/X-1', sites)?.category.name).toBe('Work');
    expect(match('https://www.atlassian.net/', sites)?.site).toBe('atlassian.net');
    expect(match('https://notatlassian.net/', sites)).toBeNull();
  });

  it('un percorso si confronta per segmenti interi, senza distinguere maiuscole e minuscole', () => {
    const sites = { work: ['github.com/mia-org'] };

    expect(match('https://github.com/Mia-Org/repo?tab=1', sites)?.site).toBe('github.com/mia-org');
    expect(match('https://github.com/mia-org', sites)?.site).toBe('github.com/mia-org');
    expect(match('https://github.com/mia-organization', sites)).toBeNull();
    expect(match('https://github.com/', sites)).toBeNull();
  });

  it('vince la regola più specifica, qualunque sia l\'ordine delle categorie', () => {
    const sites = { dev: ['github.com'], work: ['github.com/mia-org'] };

    expect(match('https://github.com/mia-org/x', sites)?.category.name).toBe('Work');
    expect(match('https://github.com/altro/x', sites)?.category.name).toBe('Dev');
  });

  it('a parità di componenti vince il percorso più lungo', () => {
    const sites = { dev: ['a.google.com'], work: ['google.com/x'] };

    expect(match('https://a.google.com/x', sites)?.category.name).toBe('Work');
  });

  it('ignora le pagine senza dominio e i siti di categorie che non esistono', () => {
    expect(match('file:///Users/me/a.pdf', { dev: ['github.com'] })).toBeNull();
    expect(match('https://github.com/', { ghost: ['github.com'] })).toBeNull();
  });

  it('il sito da ricordare è quello della regola che decide la tab, altrimenti il dominio', () => {
    const sites = { work: ['github.com/mia-org'] };

    expect(siteToRemember('https://github.com/mia-org/x', CATS, sites)).toBe('github.com/mia-org');
    expect(siteToRemember('https://www.github.com/altro', CATS, sites)).toBe('github.com');
    expect(siteToRemember('file:///a.pdf', CATS, sites)).toBeNull();
  });
});
