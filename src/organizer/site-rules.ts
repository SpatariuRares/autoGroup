import { normalizeDomain, type CategorySites } from '../settings';
import type { Category } from '../shared/types';

/** A tab taken by a rule: the site of the rule and the category it goes to. */
export interface SiteMatch {
  site: string;
  category: Category;
}

interface Rule extends SiteMatch {
  host: string;
  path: string[];
}

/** Host and path segments of a URL, in lowercase; null if the URL has no host (e.g. file://). */
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

/** A domain also covers its subdomains; the path is compared by whole segments. */
function matches(rule: Rule, host: string, segments: string[]): boolean {
  return (host === rule.host || host.endsWith(`.${rule.host}`)) && rule.path.every((segment, i) => segments[i] === segment);
}

const components = (rule: Rule) => rule.host.split('.').length + rule.path.length;

/**
 * Prepares the rules once and returns the function that finds the rule of a URL. If more
 * rules match, the most specific one wins: more components (parts of the domain + path segments),
 * and on a tie the longer path. Sites of categories that do not exist are ignored.
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
 * The site to remember for a tab ("Always put here"): that of the rule that decides it today, so
 * moving it really changes where it will go; without rules, its domain. Null if the URL has no domain.
 */
export function siteToRemember(url: string, categories: Category[], categorySites: CategorySites): string | null {
  return createSiteMatcher(categories, categorySites)(url)?.site ?? normalizeDomain(url);
}
