import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { loadSettings, type Settings } from '../settings';

/**
 * Impostazioni lette dal vivo: si rileggono quando un'altra pagina o il service worker le salva
 * (es. "Metti sempre qui" dal pannello aggiunge un sito mentre le opzioni sono aperte). `null` finché
 * non sono lette. Il setter serve a mostrare subito un salvataggio fatto dalla pagina stessa.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const reload = () => loadSettings().then(setSettings);
    reload();
    const onChanged = (_changes: unknown, area: string) => area === 'sync' && reload();
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);
  return [settings, setSettings] as const;
}
