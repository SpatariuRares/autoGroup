import { categoryKey } from '../settings';
import type { ProposedGroup, ProposedTab } from '../shared/types';
import type { OptionTarget } from './ai-input';
import { createColorAssigner } from './colors';
import type { CandidateTab } from './tab-selection';
import type { ValidGroup } from './validator';

export interface RulesContext {
  options: OptionTarget[];
  byShortId: Map<string, CandidateTab>;
  minTabs: number;
  /** Colors of the groups already open in the window. */
  usedColors: string[];
  /** Short IDs of the tabs taken by a site rule → site of the rule. */
  siteOf?: Map<string, string>;
}

export interface RulesResult {
  groups: ProposedGroup[];
  /** Short IDs of the tabs left free (new group or category below the minimum). */
  leftover: string[];
}

const toProposedTab = ({ tabId, title, url, favIconUrl }: CandidateTab): ProposedTab => ({ tabId, title, url, favIconUrl });

/**
 * Rules on groups and colors, the same at every level (AI and domain).
 * - An existing group accepts even a single tab; its name and color stay its own.
 * - A category of the list or a new group requires at least `minTabs` tabs.
 * - Categories use their fixed color; new groups rotate among the colors free in the window.
 * Groups that match no known option have the provenance `newProvenance`.
 */
export function applyGroupRules(valid: ValidGroup[], ctx: RulesContext, newProvenance: 'ai' | 'domain' = 'ai'): RulesResult {
  const optionByKey = new Map(ctx.options.map((o) => [categoryKey(o.name), o]));
  const leftover: string[] = [];
  const kept: { group: ValidGroup; option?: OptionTarget }[] = [];

  for (const group of valid) {
    const option = optionByKey.get(categoryKey(group.name));
    if (option?.kind !== 'existing' && group.tabIds.length < ctx.minTabs) {
      leftover.push(...group.tabIds);
      continue;
    }
    kept.push({ group, option });
  }

  const colors = createColorAssigner(ctx.usedColors);
  for (const { option } of kept) if (option?.kind === 'list') colors.reserve(option.color);

  const groups = kept.map(({ group, option }, i): ProposedGroup => {
    const tabs = group.tabIds.map((id) => {
      const tab = toProposedTab(ctx.byShortId.get(id)!);
      const rule = ctx.siteOf?.get(id);
      return rule ? { ...tab, rule } : tab;
    });
    const id = `g${i + 1}`;
    if (option?.kind === 'existing') {
      return { id, name: option.name, color: option.color, provenance: 'existing', existingGroupId: option.existingGroupId, tabs };
    }
    if (option?.kind === 'list') return { id, name: option.name, color: option.color, provenance: 'list', tabs };
    return { id, name: group.name, color: colors.next(), provenance: newProvenance, tabs };
  });

  return { groups, leftover };
}
