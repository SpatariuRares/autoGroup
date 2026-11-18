import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { loadSettings, type Settings } from '../settings';

/**
 * Settings read live: they are read again when another page or the service worker saves them
 * (e.g. "Always put here" from the panel adds a site while the options are open). `null` until
 * they are read. The setter is there to show right away a save made by the page itself.
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
