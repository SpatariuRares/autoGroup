import { browser, type Browser } from 'wxt/browser';
import type { ProposedTab } from '../shared/types';
import { isExcludedHost, loadSettings } from '../settings';

export const TAB_GROUP_ID_NONE = -1;

/** A free tab of the window, a candidate to join a group. */
export interface CandidateTab extends ProposedTab {
  index: number;
  /** Tab suspended by Memory Saver: it is never read nor woken up. */
  discarded: boolean;
}

const WEB_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

/** Internal browser pages: chrome://, new tab, extension pages, about:, etc. */
export function isInternalUrl(url: string | undefined): boolean {
  if (!url) return true;
  try {
    return !WEB_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return true;
  }
}

/** A tab still loading has an empty title, or one equal to the URL. */
export function hasRealTitle(tab: Browser.tabs.Tab): boolean {
  const title = tab.title?.trim();
  if (!title) return false;
  const url = tab.url ?? '';
  return title !== url && title !== url.replace(/^https?:\/\//, '');
}

export function isExcluded(url: string, excludedDomains: string[]): boolean {
  try {
    return isExcludedHost(new URL(url).hostname, excludedDomains);
  } catch {
    return false;
  }
}

/**
 * A free tab with a web page: not pinned, not in a group, not internal and not of an excluded domain
 * (subdomains included). The title does not matter: see `selectCandidateTabs`.
 */
export function isFreeWebTab(tab: Browser.tabs.Tab, excludedDomains: string[]): boolean {
  return (
    tab.id !== undefined &&
    !tab.pinned &&
    (tab.groupId ?? TAB_GROUP_ID_NONE) === TAB_GROUP_ID_NONE &&
    !isInternalUrl(tab.url) &&
    !isExcluded(tab.url!, excludedDomains)
  );
}

/**
 * Extracts the free tabs (`isFreeWebTab`) that already have a real title, sorted as in the tab strip.
 * The tabs must be passed already filtered by window.
 */
export function selectCandidateTabs(tabs: Browser.tabs.Tab[], excludedDomains: string[] = []): CandidateTab[] {
  return tabs
    .filter((tab) => isFreeWebTab(tab, excludedDomains) && hasRealTitle(tab))
    .sort((a, b) => a.index - b.index)
    .map((tab) => ({
      tabId: tab.id!,
      title: tab.title!.trim(),
      url: tab.url!,
      favIconUrl: tab.favIconUrl,
      index: tab.index,
      discarded: tab.discarded ?? false,
    }));
}

/** The tab, if it is a candidate in its window (see `selectCandidateTabs`) with the saved excluded domains. */
export async function findCandidate(tabId: number, windowId: number): Promise<CandidateTab | undefined> {
  const [tabs, { excludedDomains }] = await Promise.all([browser.tabs.query({ windowId }), loadSettings()]);
  return selectCandidateTabs(tabs, excludedDomains).find((t) => t.tabId === tabId);
}

/** Domain of a tab without "www.", or null if the URL has no host (e.g. file://). */
export function domainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host) return null;
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}
