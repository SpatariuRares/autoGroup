import { siteToRemember } from '../../src/organizer/site-rules';
import { categoryKey, type Settings } from '../../src/settings';
import type { OrganizerState } from '../../src/shared/types';

/** "Metti sempre qui" proposto dopo uno spostamento: la tab, il sito che verrebbe salvato e la categoria. */
export interface RememberOffer {
  tabId: number;
  site: string;
  category: string;
}

/** Per quanto resta visibile l'offerta "Metti sempre qui". */
export const OFFER_MS = 8000;

/**
 * Dopo aver messo una tab in un gruppo che è una categoria (della lista o un gruppo aperto con lo
 * stesso nome), il sito che "Metti sempre qui" salverebbe. Nessuna offerta se ci va già.
 */
export function rememberOffer(state: OrganizerState, tabId: number, settings: Settings | null): RememberOffer | null {
  const group = state.proposal?.groups.find((g) => g.tabs.some((t) => t.tabId === tabId));
  if (!settings || !group || (group.provenance !== 'list' && group.provenance !== 'existing')) return null;
  const category = settings.categories.find((c) => categoryKey(c.name) === categoryKey(group.name));
  const tab = group.tabs.find((t) => t.tabId === tabId)!;
  const site = siteToRemember(tab.url, settings.categories, settings.categorySites);
  if (!category || !site || settings.categorySites[category.id]?.includes(site)) return null;
  return { tabId, site, category: category.name };
}
