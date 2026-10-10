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

describe('esporta e importa le impostazioni', () => {
  it('esporta preferenze, categorie e siti, mai provider né chiavi API', async () => {
    const text = exportSettings(await loadSettings());

    expect(JSON.parse(text)).toMatchObject({
      app: 'autoGroup',
      version: 1,
      settings: { mode: 'domain', minTabs: 3, excludedDomains: ['banca.it'], categories: CATEGORIES, categorySites: { dev: ['github.com'] }, autoGroupSites: false },
    });
    expect(text).not.toContain('sk-segreta');
    expect(text).not.toContain('openrouter');
  });

  it('importare un file esportato rimette le stesse impostazioni, lasciando provider e chiavi', async () => {
    const text = exportSettings(await loadSettings());
    await saveSettings({ mode: 'ai', minTabs: 2, excludedDomains: [], categories: [], autoGroupSites: true });

    await importSettings(text);

    const settings = await loadSettings();
    expect(settings).toMatchObject({ mode: 'domain', minTabs: 3, excludedDomains: ['banca.it'], categories: CATEGORIES, categorySites: { dev: ['github.com'] }, autoGroupSites: false });
    expect(settings.generator.preset).toBe('openrouter');
    expect(await browser.storage.local.get('generatorApiKey')).toEqual({ generatorApiKey: 'sk-segreta' });
  });

  it('i domini esclusi scritti a mano vengono normalizzati, quelli non validi scartati', async () => {
    await importSettings(JSON.stringify({ app: 'autoGroup', version: 1, settings: { excludedDomains: ['https://www.Esempio.com/x', 'non valido!', 'esempio.com'] } }));

    expect((await loadSettings()).excludedDomains).toEqual(['esempio.com']);
  });

  it.each([
    ['un testo che non è JSON', 'ciao'],
    ['un JSON di un\'altra app', JSON.stringify({ app: 'altro', settings: {} })],
    ['categorie non valide', JSON.stringify({ app: 'autoGroup', version: 1, settings: { categories: [{ id: 'x', name: '', description: '', color: 'grey' }] } })],
    ['un numero minimo non valido', JSON.stringify({ app: 'autoGroup', version: 1, settings: { minTabs: 0 } })],
  ])('rifiuta %s senza cambiare nulla', async (_, text) => {
    const before = await loadSettings();

    await expect(importSettings(text)).rejects.toBeInstanceOf(SettingsError);

    expect(await loadSettings()).toEqual(before);
  });
});
