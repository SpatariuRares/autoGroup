import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import { ALL_URLS, loadApiKey, loadSettings, providerOrigin, removeDescriptionPermission, saveProvider, saveSettings, type ProviderSettings } from '../src/settings';
import { installFakeI18n } from './fake-i18n';

const OLLAMA = { preset: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' };
const KEV = { preset: 'kev', baseUrl: 'http://127.0.0.1:8009', model: '' };

/**
 * Permissions as Chrome handles them in the worst case: a host already covered by `<all_urls>` is
 * granted without being registered separately. `accept` decides the user's answer to the prompt.
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

describe('turning off descriptions without removing provider access', () => {
  it('a host granted while <all_urls> was active is requested again after it was removed', async () => {
    const permissions = chromeLikePermissions([ALL_URLS]);
    await saveSettings({ generator: OLLAMA, classifier: KEV });
    // Provider "Save" with <all_urls> active: Chrome answers yes but does not register the host.
    await fakeBrowser.permissions.request({ origins: ['http://localhost/*'] });

    expect(await removeDescriptionPermission()).toEqual([]);

    expect([...permissions.origins].sort()).toEqual(['http://127.0.0.1/*', 'http://localhost/*']);
    expect(permissions.request).toHaveBeenLastCalledWith({ origins: ['http://127.0.0.1/*', 'http://localhost/*'] });
  });

  it('if Chrome had registered the hosts it asks for nothing', async () => {
    const permissions = chromeLikePermissions([ALL_URLS, 'http://localhost/*']);
    await saveSettings({ generator: OLLAMA });

    expect(await removeDescriptionPermission()).toEqual([]);

    expect([...permissions.origins]).toEqual(['http://localhost/*']);
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it('if the user refuses, it returns the hosts left without permission', async () => {
    const permissions = chromeLikePermissions([ALL_URLS], false);
    await saveSettings({ generator: OLLAMA });

    expect(await removeDescriptionPermission()).toEqual(['http://localhost/*']);
    expect(permissions.origins.size).toBe(0);
  });

  it('without a provider with a server (Gemini Nano, none) it removes only <all_urls>', async () => {
    const permissions = chromeLikePermissions([ALL_URLS]);

    expect(await removeDescriptionPermission()).toEqual([]);

    expect(permissions.origins.size).toBe(0);
    expect(permissions.request).not.toHaveBeenCalled();
  });
});

const OPENROUTER = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' };
const UNSLOTH = { preset: 'unsloth', baseUrl: 'http://127.0.0.1:8888/v1', model: 'qwen' };

/** "Save" as the page does it: the permission requested in the click, then the save. */
function save(role: 'classifier' | 'generator', draft: ProviderSettings, apiKey = '') {
  const origin = providerOrigin(draft);
  const granted = origin ? browser.permissions.request({ origins: [origin] }) : Promise.resolve(false);
  return saveProvider(role, draft, apiKey, granted);
}

describe('saving a provider', () => {
  it('saves the provider and the API key only in storage.local; with the permission it is ready', async () => {
    const permissions = chromeLikePermissions([]);

    expect(await save('generator', OPENROUTER, ' sk-123 ')).toBe('ready');

    expect((await loadSettings()).generator).toEqual(OPENROUTER);
    expect(await loadApiKey('generator')).toBe('sk-123');
    expect(JSON.stringify(await fakeBrowser.storage.sync.get())).not.toContain('sk-123');
    expect([...permissions.origins]).toEqual(['https://openrouter.ai/*']);
  });

  it("if the user refuses the permission it says so", async () => {
    chromeLikePermissions([], false);

    expect(await save('generator', OPENROUTER)).toBe('no-permission');
  });

  it("changing server removes the permission of the previous host", async () => {
    const permissions = chromeLikePermissions([]);
    await save('generator', OLLAMA);

    await save('generator', OPENROUTER);

    expect([...permissions.origins]).toEqual(['https://openrouter.ai/*']);
  });

  it("keeps the permission of a host that the other provider still uses", async () => {
    const permissions = chromeLikePermissions([]);
    await save('classifier', KEV);
    await save('generator', UNSLOTH);

    await save('generator', OPENROUTER);

    expect([...permissions.origins].sort()).toEqual(['http://127.0.0.1/*', 'https://openrouter.ai/*']);
  });

  it('Gemini Nano and "none" ask for no permissions and remove the previous one', async () => {
    const permissions = chromeLikePermissions([]);
    await save('generator', OLLAMA);

    expect(await save('generator', { preset: 'nano', baseUrl: '', model: '' })).toBe('nano');
    expect(await save('generator', { preset: 'none', baseUrl: '', model: '' })).toBe('off');

    expect(permissions.origins.size).toBe(0);
    expect(permissions.request).toHaveBeenCalledTimes(1);
  });

  it('without a model the Generator is incomplete; a non-http(s) URL has no permission to request', async () => {
    chromeLikePermissions([]);

    expect(await save('generator', { ...OPENROUTER, model: '' })).toBe('incomplete');
    expect(providerOrigin({ preset: 'custom', baseUrl: 'ftp://x', model: 'm' })).toBeNull();
  });
});
