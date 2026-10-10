import type { Browser } from 'wxt/browser';
import { isExcluded, isInternalUrl, TAB_GROUP_ID_NONE } from './tab-selection';

/** La pagina di una tab per riconoscere i doppioni: l'URL senza il frammento (#sezione); i parametri contano. */
function pageOf(url: string): string {
  const hash = url.indexOf('#');
  return hash === -1 ? url : url.slice(0, hash);
}

const grouped = (tab: Browser.tabs.Tab) => (tab.groupId ?? TAB_GROUP_ID_NONE) !== TAB_GROUP_ID_NONE;

/** Si può chiudere solo una copia libera, non attiva: mai tab fissate, raggruppate o che l'utente sta guardando. */
const closable = (tab: Browser.tabs.Tab) => !tab.pinned && !grouped(tab) && !tab.active;

/**
 * Le tab da chiudere perché doppioni di un'altra tab della stessa finestra, nell'ordine della barra.
 * Per ogni pagina aperta più volte resta la copia fissata, poi quella in un gruppo, poi quella attiva,
 * poi la più a sinistra; delle altre si chiudono solo quelle libere. Pagine del browser e domini
 * esclusi non sono mai toccati. Le tab vanno passate già filtrate per finestra.
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
    // sort è stabile: a parità di rango resta la più a sinistra.
    const [, ...others] = [...copies].sort((a, b) => rank(a) - rank(b));
    duplicates.push(...others.filter(closable));
  }
  return duplicates.sort((a, b) => a.index - b.index).map((t) => t.id!);
}
