import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { exportSettings, importSettings } from '../src/settings/backup';
import { loadSettings, saveApiKey, saveSettings, SettingsError } from '../src/settings';
import type { Category } from '../src/shared/types';
import { installFakeI18n } from './fake-i18n';

const CATEGORIES: Category[] = [
  { id: 'dev', name: 'Dev', description: 'Programmazione', color: 'grey' },
  { id: 'w', name: 'Lavoro', description: 'Email', color: 'blue' },
];

beforeEach(async () => {
  fakeBrowser.reset();
  installFakeI18n('it');
  await saveSettings({
    mode: 'domain',
    minTabs: 3,
    excludedDomains: ['banca.it'],
    categories: CATEGORIES,
    categorySites: { dev: ['github.com'] },
    autoGroupSites: false,
    generator: { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'm' },
  });
  await saveApiKey('generator', 'sk-segreta');
});

describe('export and import the settings', () => {
  it('exports preferences, categories and sites, never providers or API keys', async () => {
    const text = exportSettings(await loadSettings());

    expect(JSON.parse(text)).toMatchObject({
      app: 'autoGroup',
      version: 1,
      settings: { mode: 'domain', minTabs: 3, excludedDomains: ['banca.it'], categories: CATEGORIES, categorySites: { dev: ['github.com'] }, autoGroupSites: false },
    });
    expect(text).not.toContain('sk-segreta');
    expect(text).not.toContain('openrouter');
  });

  it('importing an exported file restores the same settings, leaving providers and keys', async () => {
    const text = exportSettings(await loadSettings());
    await saveSettings({ mode: 'ai', minTabs: 2, excludedDomains: [], categories: [], autoGroupSites: true });

    await importSettings(text);

    const settings = await loadSettings();
    expect(settings).toMatchObject({ mode: 'domain', minTabs: 3, excludedDomains: ['banca.it'], categories: CATEGORIES, categorySites: { dev: ['github.com'] }, autoGroupSites: false });
    expect(settings.generator.preset).toBe('openrouter');
    expect(await browser.storage.local.get('generatorApiKey')).toEqual({ generatorApiKey: 'sk-segreta' });
  });

  it('excluded domains written by hand are normalized, invalid ones discarded', async () => {
    await importSettings(JSON.stringify({ app: 'autoGroup', version: 1, settings: { excludedDomains: ['https://www.Esempio.com/x', 'non valido!', 'esempio.com'] } }));

    expect((await loadSettings()).excludedDomains).toEqual(['esempio.com']);
  });

  it('a non-boolean switch makes the file invalid', async () => {
    await expect(importSettings(JSON.stringify({ app: 'autoGroup', version: 1, settings: { autoGroupSites: 'sì' } }))).rejects.toMatchObject({ messageKey: 'optionsImportInvalid' });
  });

  it.each([
    ['a text that is not JSON', 'ciao'],
    ['JSON from another app', JSON.stringify({ app: 'altro', settings: {} })],
    ['invalid categories', JSON.stringify({ app: 'autoGroup', version: 1, settings: { categories: [{ id: 'x', name: '', description: '', color: 'grey' }] } })],
    ['an invalid minimum number', JSON.stringify({ app: 'autoGroup', version: 1, settings: { minTabs: 0 } })],
    ['excluded domains that are not a list', JSON.stringify({ app: 'autoGroup', version: 1, settings: { excludedDomains: 'banca.it' } })],
    ['a non-boolean automatic grouping', JSON.stringify({ app: 'autoGroup', version: 1, settings: { autoGroupSites: 'sì' } })],
  ])('rejects %s without changing anything', async (_, text) => {
    const before = await loadSettings();

    await expect(importSettings(text)).rejects.toBeInstanceOf(SettingsError);

    expect(await loadSettings()).toEqual(before);
  });
});
