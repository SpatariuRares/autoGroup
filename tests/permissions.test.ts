import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import { ALL_URLS, loadApiKey, loadSettings, providerOrigin, removeDescriptionPermission, saveProvider, saveSettings, type ProviderSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';

const OLLAMA = { preset: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' };
const KEV = { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' };

/**
 * Permessi come li gestisce Chrome nel caso peggiore: un host già coperto da `<all_urls>` viene
 * concesso senza essere registrato a parte. `accept` decide la risposta dell'utente alla finestra.
 */
function chromeLikePermissions(granted: string[], accept = true) {
  const origins = new Set(granted);
  const covered = (o: string) => origins.has(o) || origins.has(ALL_URLS);
  const request = vi.fn(async ({ origins: wanted = [] }: { origins?: string[] }) => {
    if (wanted.every(covered)) return true;
    if (!accept) return false;
    wanted.forEach((o) => origins.add(o));
    return true;
  });
  Object.assign(fakeBrowser.permissions, {
    contains: async ({ origins: wanted = [] }: { origins?: string[] }) => wanted.every(covered),
    request,
    remove: async ({ origins: gone = [] }: { origins?: string[] }) => (gone.forEach((o) => origins.delete(o)), true),
  });
  return { origins, request };
}

beforeEach(() => {
  fakeBrowser.reset();
  installFakeI18n('it');
});

describe('spegnere le descrizioni senza togliere l\'accesso ai provider', () => {
  it('un host concesso mentre <all_urls> era attivo viene richiesto di nuovo dopo averlo tolto', async () => {
    const permissions = chromeLikePermissions([ALL_URLS]);
    await saveSettings({ generator: OLLAMA, classifier: KEV });
    // "Salva" del provider con <all_urls> attivo: Chrome risponde sì ma non registra l'host.
    await fakeBrowser.permissions.request({ origins: ['http://localhost/*'] });

    expect(await removeDescriptionPermission()).toEqual([]);

    expect([...permissions.origins].sort()).toEqual(['http://127.0.0.1/*', 'http://localhost/*']);
    expect(permissions.request).toHaveBeenLastCalledWith({ origins: ['http://127.0.0.1/*', 'http://localhost/*'] });
  });

  it('se Chrome aveva registrato gli host non chiede nulla', async () => {
    const permissions = chromeLikePermissions([ALL_URLS, 'http://localhost/*']);
    await saveSettings({ generator: OLLAMA });

    expect(await removeDescriptionPermission()).toEqual([]);

    expect([...permissions.origins]).toEqual(['http://localhost/*']);
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it('se l\'utente rifiuta, restituisce gli host rimasti senza permesso', async () => {
    const permissions = chromeLikePermissions([ALL_URLS], false);
    await saveSettings({ generator: OLLAMA });

    expect(await removeDescriptionPermission()).toEqual(['http://localhost/*']);
    expect(permissions.origins.size).toBe(0);
  });

  it('senza provider con un server (Gemini Nano, nessuno) toglie solo <all_urls>', async () => {
    const permissions = chromeLikePermissions([ALL_URLS]);

    expect(await removeDescriptionPermission()).toEqual([]);

    expect(permissions.origins.size).toBe(0);
    expect(permissions.request).not.toHaveBeenCalled();
  });
});

const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' };
const UNSLOTH = { preset: 'unsloth', baseUrl: 'http://127.0.0.1:8888/v1', model: 'qwen' };

/** "Salva" come lo fa la pagina: il permesso chiesto nel clic, poi il salvataggio. */
function save(role: 'classifier' | 'generator', draft: ProviderSettings, apiKey = '') {
  const origin = providerOrigin(draft);
  const granted = origin ? browser.permissions.request({ origins: [origin] }) : Promise.resolve(false);
  return saveProvider(role, draft, apiKey, granted);
}

describe('salvare un provider', () => {
  it('salva il provider e la chiave API solo in storage.local; con il permesso è pronto', async () => {
    const permissions = chromeLikePermissions([]);

    expect(await save('generator', OPENROUTER, ' sk-123 ')).toBe('ready');

    expect((await loadSettings()).generator).toEqual(OPENROUTER);
    expect(await loadApiKey('generator')).toBe('sk-123');
    expect(JSON.stringify(await fakeBrowser.storage.sync.get())).not.toContain('sk-123');
    expect([...permissions.origins]).toEqual(['https://openrouter.ai/*']);
  });

  it("se l'utente rifiuta il permesso lo dice", async () => {
    chromeLikePermissions([], false);

    expect(await save('generator', OPENROUTER)).toBe('no-permission');
  });

  it("cambiando server toglie il permesso dell'host di prima", async () => {
    const permissions = chromeLikePermissions([]);
    await save('generator', OLLAMA);

    await save('generator', OPENROUTER);

    expect([...permissions.origins]).toEqual(['https://openrouter.ai/*']);
  });

  it("tiene il permesso di un host che l'altro provider usa ancora", async () => {
    const permissions = chromeLikePermissions([]);
    await save('classifier', KEV);
    await save('generator', UNSLOTH);

    await save('generator', OPENROUTER);

    expect([...permissions.origins].sort()).toEqual(['http://127.0.0.1/*', 'https://openrouter.ai/*']);
  });

  it('Gemini Nano e "nessuno" non chiedono permessi e tolgono quello di prima', async () => {
    const permissions = chromeLikePermissions([]);
    await save('generator', OLLAMA);

    expect(await save('generator', { preset: 'nano', baseUrl: '', model: '' })).toBe('nano');
    expect(await save('generator', { preset: 'none', baseUrl: '', model: '' })).toBe('off');

    expect(permissions.origins.size).toBe(0);
    expect(permissions.request).toHaveBeenCalledTimes(1);
  });

  it('senza modello il Generatore è incompleto; un URL non http(s) non ha permesso da chiedere', async () => {
    chromeLikePermissions([]);

    expect(await save('generator', { ...OPENROUTER, model: '' })).toBe('incomplete');
    expect(providerOrigin({ preset: 'custom', baseUrl: 'ftp://x', model: 'm' })).toBeNull();
  });
});
