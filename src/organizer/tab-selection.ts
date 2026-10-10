import type { Browser } from 'wxt/browser';
import type { ProposedTab } from '../shared/types';
import { isExcludedHost } from '../settings';

export const TAB_GROUP_ID_NONE = -1;

/** Una tab libera della finestra, candidata a entrare in un gruppo. */
export interface CandidateTab extends ProposedTab {
  index: number;
  /** Tab sospesa da Risparmio memoria: non va mai letta né risvegliata. */
  discarded: boolean;
}

const WEB_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

/** Pagine interne del browser: chrome://, nuova scheda, pagine di estensioni, about:, ecc. */
export function isInternalUrl(url: string | undefined): boolean {
  if (!url) return true;
  try {
    return !WEB_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return true;
  }
}

/** Una tab ancora in caricamento ha un titolo vuoto, oppure uguale all'URL. */
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
 * Una tab libera con una pagina web: non fissata, non in un gruppo, non interna e non di un dominio
 * escluso (compresi i sottodomini). Il titolo non conta: vedi `selectCandidateTabs`.
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
 * Estrae le tab libere (`isFreeWebTab`) che hanno già un titolo vero, ordinate come nella barra.
 * Le tab vanno passate già filtrate per finestra.
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
