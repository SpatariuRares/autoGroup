import type { CandidateTab } from './tab-selection';

/** Dominio di una tab senza "www.", oppure null se l'URL non ha un host (es. file://). */
export function domainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host) return null;
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

export interface DomainGroup {
  name: string;
  tabs: CandidateTab[];
}

/**
 * Raggruppa le tab per dominio. Un dominio diventa un gruppo solo se ha almeno `minTabs` tab, salvo
 * i domini in `openDomains` (c'è già un gruppo aperto con quel nome): lì basta una tab, come per
 * l'AI una tab può entrare da sola in un gruppo esistente. I gruppi seguono l'ordine della prima tab.
 */
export function groupByDomain(tabs: CandidateTab[], minTabs: number, openDomains: Set<string> = new Set()): DomainGroup[] {
  const byDomain = new Map<string, CandidateTab[]>();
  for (const tab of tabs) {
    const domain = domainOf(tab.url);
    if (!domain) continue;
    const list = byDomain.get(domain) ?? [];
    list.push(tab);
    byDomain.set(domain, list);
  }
  return [...byDomain.entries()]
    .filter(([name, list]) => list.length >= minTabs || openDomains.has(name))
    .map(([name, list]) => ({ name, tabs: list }));
}
