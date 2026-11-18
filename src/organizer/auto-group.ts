import { browser, type Browser } from 'wxt/browser';
import { categoryKey, loadSettings } from '../settings';
import { createSiteMatcher } from './site-rules';
import { isFreeWebTab } from './tab-selection';

/**
 * Automatic grouping with the site rules, without AI: if the tab is free and its URL belongs to a
 * site of a category, it joins the open group of its window with the category's name (even
 * alone, without changing name and color). Without that group, it creates one with the category's
 * name and color only if, together with the other free tabs of the window in the same category, it
 * reaches the minimum number of tabs. It saves no snapshot for "Undo": the switch in the settings is enough.
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
