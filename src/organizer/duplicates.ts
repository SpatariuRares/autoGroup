import type { Browser } from 'wxt/browser';
import { isExcluded, isInternalUrl, TAB_GROUP_ID_NONE } from './tab-selection';

/** The page of a tab, to recognize duplicates: the URL without the fragment (#section); the parameters count. */
function pageOf(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

const grouped = (tab: Browser.tabs.Tab) => (tab.groupId ?? TAB_GROUP_ID_NONE) !== TAB_GROUP_ID_NONE;

/** Only a free, non-active copy can be closed: never pinned or grouped tabs, nor the ones the user is looking at. */
const closable = (tab: Browser.tabs.Tab) => !tab.pinned && !grouped(tab) && !tab.active;

/**
 * The tabs to close because they are duplicates of another tab in the same window, in tab-strip order.
 * For each page open more than once, the pinned copy stays, then the one in a group, then the active one,
 * then the leftmost; of the others only the free ones are closed. Browser pages and excluded domains
 * are never touched. The tabs must be passed already filtered by window.
 */
export function findDuplicates(tabs: Browser.tabs.Tab[], excludedDomains: string[]): number[] {
  const pages = new Map<string, Browser.tabs.Tab[]>();
  for (const tab of [...tabs].sort((a, b) => a.index - b.index)) {
    if (tab.id === undefined || isInternalUrl(tab.url) || isExcluded(tab.url!, excludedDomains)) continue;
    const key = pageOf(tab.url!);
    pages.set(key, [...(pages.get(key) ?? []), tab]);
  }
  const rank = (t: Browser.tabs.Tab) => (t.pinned ? 0 : grouped(t) ? 1 : t.active ? 2 : 3);
  const duplicates: Browser.tabs.Tab[] = [];
  for (const copies of pages.values()) {
    if (copies.length < 2) continue;
    // sort is stable: on equal rank the leftmost stays.
    const [, ...others] = [...copies].sort((a, b) => rank(a) - rank(b));
    duplicates.push(...others.filter(closable));
  }
  return duplicates.sort((a, b) => a.index - b.index).map((t) => t.id!);
}
