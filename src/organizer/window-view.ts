import type { Browser } from 'wxt/browser';
import type { ExistingGroupView, GroupColor, HeldReason, LiveTab, Proposal, ProposedTab, WindowView } from '../shared/types';
import { findDuplicates } from './duplicates';
import { daysSinceAccess, findInactive, INACTIVE_DAYS } from './inactive';
import { hasRealTitle, isExcluded, isInternalUrl, TAB_GROUP_ID_NONE } from './tab-selection';

const toTab = (tab: Browser.tabs.Tab): ProposedTab => ({ tabId: tab.id!, title: tab.title?.trim() || tab.url || '', url: tab.url ?? '', favIconUrl: tab.favIconUrl });

function heldReason(tab: Browser.tabs.Tab, excludedDomains: string[]): HeldReason | null {
  if (tab.pinned) return 'pinned';
  if (isInternalUrl(tab.url)) return 'internal';
  if (isExcluded(tab.url!, excludedDomains)) return 'excluded';
  if (!hasRealTitle(tab)) return 'loading';
  return null;
}

/**
 * Unisce le tab e i gruppi della finestra (letti dal vivo) con la proposta: i gruppi aperti con le
 * loro tab e quelle aggiunte, i gruppi nuovi, le tab libere rimaste fuori e quelle mai toccate.
 * I gruppi aperti seguono l'ordine della barra; le tab l'ordine della finestra.
 */
export function buildWindowView(
  tabs: Browser.tabs.Tab[],
  groups: Browser.tabGroups.TabGroup[],
  proposal: Proposal | undefined,
  excludedDomains: string[],
  now: number,
): WindowView {
  const ordered = [...tabs].filter((t) => t.id !== undefined).sort((a, b) => a.index - b.index);
  const byId = new Map(ordered.map((t) => [t.id!, t]));
  const proposed = new Set((proposal?.groups ?? []).flatMap((g) => g.tabs.map((t) => t.tabId)));
  const byChromeGroup = new Map((proposal?.groups ?? []).filter((g) => g.existingGroupId !== undefined).map((g) => [g.existingGroupId!, g]));

  const existing: ExistingGroupView[] = [];
  for (const tab of ordered) {
    const groupId = tab.groupId ?? TAB_GROUP_ID_NONE;
    if (groupId === TAB_GROUP_ID_NONE) continue;
    let view = existing.find((v) => v.group.id === groupId);
    if (!view) {
      const chrome = groups.find((g) => g.id === groupId);
      const extension = byChromeGroup.get(groupId);
      view = {
        group: { id: groupId, name: chrome?.title ?? '', color: (chrome?.color ?? 'grey') as GroupColor },
        current: [],
        added: extension?.tabs ?? [],
        proposedGroupId: extension?.id,
        collapsed: chrome?.collapsed ?? false,
      };
      existing.push(view);
    }
    view.current.push(toTab(tab));
  }

  const free: ProposedTab[] = [];
  const held: WindowView['held'] = [];
  for (const tab of ordered) {
    if ((tab.groupId ?? TAB_GROUP_ID_NONE) !== TAB_GROUP_ID_NONE || proposed.has(tab.id!)) continue;
    const reason = heldReason(tab, excludedDomains);
    if (reason) held.push({ tab: toTab(tab), reason });
    else free.push(toTab(tab));
  }

  const inactive = new Set(findInactive(tabs, excludedDomains, now));
  const live: Record<number, LiveTab> = {};
  for (const tab of ordered) {
    live[tab.id!] = {
      active: tab.active ?? false,
      audible: tab.audible ?? false,
      muted: tab.mutedInfo?.muted ?? false,
      ...(inactive.has(tab.id!) ? { idleDays: daysSinceAccess(tab, now) } : {}),
    };
  }

  return {
    existing,
    created: (proposal?.groups ?? []).filter((g) => g.existingGroupId === undefined),
    free,
    held,
    duplicates: findDuplicates(tabs, excludedDomains).map((id) => toTab(byId.get(id)!)),
    inactive: [...inactive].map((id) => toTab(byId.get(id)!)),
    inactiveDays: INACTIVE_DAYS,
    live,
  };
}
