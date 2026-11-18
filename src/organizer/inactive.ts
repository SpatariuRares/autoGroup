import type { Browser } from 'wxt/browser';
import { isExcluded, isInternalUrl } from './tab-selection';

/** After how many days without being looked at a tab counts as inactive. */
export const INACTIVE_DAYS = 7;

const DAY = 86_400_000;

/** Whole days since the tab was last looked at; `undefined` if Chrome does not know it. */
export function daysSinceAccess(tab: Browser.tabs.Tab, now: number): number | undefined {
  return tab.lastAccessed === undefined ? undefined : Math.floor((now - tab.lastAccessed) / DAY);
}

/**
 * The tabs that "Close inactive" would close, in tab-strip order: not looked at for at least
 * `INACTIVE_DAYS` days, even inside a group. Never pinned, active or audible tabs, browser pages or
 * excluded domains. The tabs must be passed already filtered by window.
 */
export function findInactive(tabs: Browser.tabs.Tab[], excludedDomains: string[], now: number): number[] {
  return [...tabs]
    .filter(
      (tab) =>
        tab.id !== undefined &&
        !tab.pinned &&
        !tab.active &&
        !tab.audible &&
        !isInternalUrl(tab.url) &&
        !isExcluded(tab.url!, excludedDomains) &&
        (daysSinceAccess(tab, now) ?? 0) >= INACTIVE_DAYS,
    )
    .sort((a, b) => a.index - b.index)
    .map((tab) => tab.id!);
}
