import { normalizeDomain, type CategorySites } from '../settings';
import type { Category } from '../shared/types';

/** Una tab presa da una regola: il sito della regola e la categoria in cui va. */
export interface SiteMatch {
  site: string;
  category: Category;
}

interface Rule extends SiteMatch {
  host: string;
  path: string[];
}

/** Host e segmenti del percorso di un URL, in minuscolo; null se l'URL non ha un host (es. file://). */
function urlParts(url: string): { host: string; segments: string[] } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host) return null;
    return { host, segments: u.pathname.toLowerCase().split('/').filter(Boolean) };
  } catch {
    return null;
  }
}

/** Un dominio vale anche per i sottodomini; il percorso si confronta per segmenti interi. */
function matches(rule: Rule, host: string, segments: string[]): boolean {
  return (host === rule.host || host.endsWith(`.${rule.host}`)) && rule.path.every((segment, i) => segments[i] === segment);
}

const components = (rule: Rule) => rule.host.split('.').length + rule.path.length;

/**
 * Prepara le regole una volta sola e restituisce la funzione che trova la regola di un URL. Se più
 * regole corrispondono vince la più specifica: più componenti (parti del dominio + segmenti del
 * percorso), a parità il percorso più lungo. I siti di categorie che non esistono sono ignorati.
 */
export function createSiteMatcher(categories: Category[], categorySites: CategorySites): (url: string) => SiteMatch | null {
  const rules = categories
    .flatMap((category) =>
      (categorySites[category.id] ?? []).map((site): Rule => {
        const [host, ...path] = site.split('/');
        return { site, category, host: host!, path };
      }),
    )
    .sort((a, b) => components(b) - components(a) || b.path.length - a.path.length);
  return (url) => {
    const parts = urlParts(url);
    const rule = parts && rules.find((r) => matches(r, parts.host, parts.segments));
    return rule ? { site: rule.site, category: rule.category } : null;
  };
}

/**
 * Il sito da ricordare per una tab ("Metti sempre qui"): quello della regola che oggi la decide, così
 * spostarlo cambia davvero dove andrà; senza regole il suo dominio. Null se l'URL non ha un dominio.
 */
export function siteToRemember(url: string, categories: Category[], categorySites: CategorySites): string | null {
  return createSiteMatcher(categories, categorySites)(url)?.site ?? normalizeDomain(url);
}
