import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSettings, saveSettings, SettingsError, type Settings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
});

/** Il messaggio con cui `saveSettings` rifiuta la patch, o null se la salva. */
async function rejection(patch: Partial<Settings>): Promise<string | null> {
  try {
    await saveSettings(patch);
    return null;
  } catch (err) {
    return err instanceof SettingsError ? err.messageKey : String(err);
  }
}

describe('salvataggio delle impostazioni', () => {
  it.each<[string, Partial<Settings>, string]>([
    ['modalità sconosciuta', { mode: 'boh' as never }, 'errorSaveSettings'],
    ['minimo non intero', { minTabs: 1.5 }, 'optionsMinTabsInvalid'],
    ['soglia oltre 1', { threshold: 2 }, 'optionsThresholdInvalid'],
    ['domini esclusi non lista', { excludedDomains: 'banca.it' as never }, 'errorSaveSettings'],
    ['descrizioni non booleano', { readDescriptions: 'sì' as never }, 'errorSaveSettings'],
    ['raggruppamento automatico non booleano', { autoGroupSites: 1 as never }, 'errorSaveSettings'],
  ])('rifiuta %s e non salva nulla', async (_name, patch, key) => {
    expect(await rejection(patch)).toBe(key);
    expect(await browser.storage.sync.get(null)).toEqual({});
  });

  it('i domini esclusi vengono normalizzati, senza doppioni, e quelli non validi scartati', async () => {
    await saveSettings({ excludedDomains: ['https://www.Banca.it/conto', 'banca.it', 'non valido!', 'posta.it'] });

    expect((await loadSettings()).excludedDomains).toEqual(['banca.it', 'posta.it']);
  });

  it('salva solo i campi indicati e li rilegge', async () => {
    await saveSettings({ minTabs: 4, excludedDomains: ['banca.it'], autoGroupSites: false });

    expect(await loadSettings()).toMatchObject({ mode: 'ai', minTabs: 4, excludedDomains: ['banca.it'], autoGroupSites: false, readDescriptions: false });
  });
});

describe('lettura delle impostazioni', () => {
  it('senza nulla di salvato valgono i default', async () => {
    const settings = await loadSettings();

    expect(settings).toMatchObject({
      mode: 'ai',
      minTabs: 2,
      excludedDomains: [],
      categorySites: {},
      generator: { preset: 'nano', baseUrl: '', model: '' },
      classifier: { preset: 'none', baseUrl: '', model: '' },
      threshold: 0.7,
      readDescriptions: false,
      autoGroupSites: true,
    });
    expect(settings.categories).toHaveLength(10);
  });

  it('un valore rovinato nello storage torna al default, gli altri restano', async () => {
    await browser.storage.sync.set({ minTabs: -1, threshold: 'alta', excludedDomains: 'x', autoGroupSites: 'no', readDescriptions: true, mode: 'domain' });

    expect(await loadSettings()).toMatchObject({ minTabs: 2, threshold: 0.7, excludedDomains: [], autoGroupSites: true, readDescriptions: true, mode: 'domain' });
  });

  it('un dominio escluso rovinato nello storage non toglie gli altri dalla lista', async () => {
    await browser.storage.sync.set({ excludedDomains: ['banca.it', 'www.posta.it', 42] });

    expect((await loadSettings()).excludedDomains).toEqual(['banca.it', 'posta.it']);
  });

  it('ogni impostazione salvata viene riletta', async () => {
    const saved: Partial<Settings> = {
      mode: 'domain',
      minTabs: 5,
      excludedDomains: ['banca.it'],
      categories: [{ id: 'a', name: 'A', description: '', color: 'red' }],
      categorySites: { a: ['a.it'] },
      generator: { preset: 'custom', baseUrl: 'https://x.it/v1', model: 'm' },
      classifier: { preset: 'custom', baseUrl: 'https://y.it', model: '' },
      threshold: 0.4,
      readDescriptions: true,
      autoGroupSites: false,
    };
    await saveSettings(saved);

    expect(await loadSettings()).toEqual(saved);
  });
});
