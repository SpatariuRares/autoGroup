import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { loadSettings, saveSettings, SettingsError, type Settings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
});

/** The message with which `saveSettings` rejects the patch, or null if it saves it. */
async function rejection(patch: Partial<Settings>): Promise<string | null> {
  try {
    await saveSettings(patch);
    return null;
  } catch (err) {
    return err instanceof SettingsError ? err.messageKey : String(err);
  }
}

describe('saving settings', () => {
  it.each<[string, Partial<Settings>, string]>([
    ['unknown mode', { mode: 'boh' as never }, 'errorSaveSettings'],
    ['minTabs not an integer', { minTabs: 1.5 }, 'optionsMinTabsInvalid'],
    ['threshold above 1', { threshold: 2 }, 'optionsThresholdInvalid'],
    ['excluded domains not a list', { excludedDomains: 'banca.it' as never }, 'errorSaveSettings'],
    ['descriptions not a boolean', { readDescriptions: 'sì' as never }, 'errorSaveSettings'],
    ['automatic grouping not a boolean', { autoGroupSites: 1 as never }, 'errorSaveSettings'],
  ])('rejects %s and saves nothing', async (_name, patch, key) => {
    expect(await rejection(patch)).toBe(key);
    expect(await browser.storage.sync.get(null)).toEqual({});
  });

  it('excluded domains are normalized, without duplicates, and invalid ones are discarded', async () => {
    await saveSettings({ excludedDomains: ['https://www.Banca.it/conto', 'banca.it', 'non valido!', 'posta.it'] });

    expect((await loadSettings()).excludedDomains).toEqual(['banca.it', 'posta.it']);
  });

  it('saves only the given fields and reads them back', async () => {
    await saveSettings({ minTabs: 4, excludedDomains: ['banca.it'], autoGroupSites: false });

    expect(await loadSettings()).toMatchObject({ mode: 'ai', minTabs: 4, excludedDomains: ['banca.it'], autoGroupSites: false, readDescriptions: false });
  });
});

describe('reading settings', () => {
  it('with nothing saved the defaults apply', async () => {
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

  it('a corrupted value in storage goes back to the default, the others stay', async () => {
    await browser.storage.sync.set({ minTabs: -1, threshold: 'alta', excludedDomains: 'x', autoGroupSites: 'no', readDescriptions: true, mode: 'domain' });

    expect(await loadSettings()).toMatchObject({ minTabs: 2, threshold: 0.7, excludedDomains: [], autoGroupSites: true, readDescriptions: true, mode: 'domain' });
  });

  it('a corrupted excluded domain in storage does not remove the others from the list', async () => {
    await browser.storage.sync.set({ excludedDomains: ['banca.it', 'www.posta.it', 42] });

    expect((await loadSettings()).excludedDomains).toEqual(['banca.it', 'posta.it']);
  });

  it('every saved setting is read back', async () => {
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
