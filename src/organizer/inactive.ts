import type { Browser } from 'wxt/browser';
import { isExcluded, isInternalUrl } from './tab-selection';

/** Dopo quanti giorni senza essere guardata una tab conta come inattiva. */
export const INACTIVE_DAYS = 7;

const DAY = 86_400_000;

/** Giorni interi da quando la tab è stata guardata l'ultima volta; `undefined` se Chrome non lo sa. */
export function daysSinceAccess(tab: Browser.tabs.Tab, now: number): number | undefined {
  return tab.lastAccessed === undefined ? undefined : Math.floor((now - tab.lastAccessed) / DAY);
}

/**
 * Le tab che "Chiudi inattive" chiuderebbe, nell'ordine della barra: non guardate da almeno
 * `INACTIVE_DAYS` giorni, anche dentro un gruppo. Mai tab fissate, attive o che suonano, pagine del
 * browser o domini esclusi. Le tab vanno passate già filtrate per finestra.
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
