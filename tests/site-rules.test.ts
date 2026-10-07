import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSettings, normalizeSite, resetCategories, saveSettings, SettingsError } from '../src/settings';
import type { Category } from '../src/shared/types';
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
