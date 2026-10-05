import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ALL_URLS, removeDescriptionPermission, saveSettings } from '../src/settings';
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
