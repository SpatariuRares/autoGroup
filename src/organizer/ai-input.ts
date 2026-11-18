import type { Browser } from 'wxt/browser';
import type { AiOption, AiTab } from '../ai/types';
import { categoryKey } from '../settings';
import type { Category, GroupColor } from '../shared/types';
import type { CandidateTab } from './tab-selection';

/** URL cleaned up for the AI: host and path, without scheme, credentials, query or fragment. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return '';
  }
}

/**
 * Tab data for the AI, with short IDs (t1, t2, …), and the table to go back to Chrome's tabs.
 * The page description is there only if the description reader has read it.
 */
export function prepareTabs(
  candidates: CandidateTab[],
  descriptions: Map<number, string> = new Map(),
): { tabs: AiTab[]; byShortId: Map<string, CandidateTab> } {
  const byShortId = new Map<string, CandidateTab>();
  const tabs = candidates.map((tab, i): AiTab => {
    const id = `t${i + 1}`;
    byShortId.set(id, tab);
    const description = descriptions.get(tab.tabId);
    return { id, title: tab.title, url: cleanUrl(tab.url), ...(description ? { description } : {}) };
  });
  return { tabs, byShortId };
}

/** A known option with what is needed to build the proposed group. */
export interface OptionTarget extends AiOption {
  kind: 'list' | 'existing';
  color: GroupColor;
  /** Only for groups already open. */
  existingGroupId?: number;
}

/**
 * Options for the AI: the categories of the list plus the groups already open in the window.
 * An open group with the same name as a category (case-insensitive)
 * takes the place of the category, with its description; the tabs will be added to it.
 * The other open groups have the description `userGroupDescription(name)`. Groups without a name are excluded.
 */
export function buildOptions(
  categories: Category[],
  openGroups: Browser.tabGroups.TabGroup[],
  userGroupDescription: (name: string) => string,
): OptionTarget[] {
  const options: OptionTarget[] = categories.map((c) => ({
    kind: 'list',
    name: c.name,
    description: c.description,
    color: c.color,
  }));
  for (const group of openGroups) {
    const name = group.title?.trim();
    if (!name) continue;
    const existing = { kind: 'existing' as const, color: group.color as GroupColor, existingGroupId: group.id };
    const index = options.findIndex((o) => categoryKey(o.name) === categoryKey(name));
    if (index === -1) {
      options.push({ ...existing, name, description: userGroupDescription(name) });
    } else if (options[index]!.kind === 'list') {
      options[index] = { ...existing, name, description: options[index]!.description };
    }
  }
  return options;
}
