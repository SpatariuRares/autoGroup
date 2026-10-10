import { browser, type Browser } from 'wxt/browser';
import { categoryKey, loadSettings } from '../settings';
import { createSiteMatcher } from './site-rules';
import { isFreeWebTab } from './tab-selection';

/**
 * Raggruppamento automatico con le regole sui siti, senza AI: se la tab è libera e il suo URL è di un
 * sito di una categoria, entra nel gruppo aperto della sua finestra con il nome della categoria (anche
 * da sola, senza cambiarne nome e colore). Senza quel gruppo, ne crea uno con nome e colore della
 * categoria solo se, insieme alle altre tab libere della finestra della stessa categoria, raggiunge il
 * minimo di tab. Non salva nessuna foto per "Annulla": basta l'interruttore nelle impostazioni.
 */
export async function autoGroupTab(tabId: number): Promise<void> {
  const settings = await loadSettings();
  if (!settings.autoGroupSites) return;
  const tab = await browser.tabs.get(tabId).catch(() => null);
  const free = (t: Browser.tabs.Tab) => isFreeWebTab(t, settings.excludedDomains);
  if (!tab || tab.windowId === undefined || !free(tab)) return;

  const match = createSiteMatcher(settings.categories, settings.categorySites);
  const category = match(tab.url!)?.category;
  if (!category) return;

  const groups = await browser.tabGroups.query({ windowId: tab.windowId });
  const open = groups.find((g) => categoryKey(g.title ?? '') === categoryKey(category.name));
  if (open) {
    await browser.tabs.group({ groupId: open.id, tabIds: [tabId] });
    return;
  }

  const tabs = await browser.tabs.query({ windowId: tab.windowId });
  const tabIds = tabs
    .filter((t) => free(t) && match(t.url!)?.category.id === category.id)
    .sort((a, b) => a.index - b.index)
    .map((t) => t.id!);
  if (tabIds.length < settings.minTabs) return;
  const groupId = await browser.tabs.group({ tabIds: tabIds as [number, ...number[]], createProperties: { windowId: tab.windowId } });
  await browser.tabGroups.update(groupId, { title: category.name, color: category.color as Browser.tabGroups.Color });
}
