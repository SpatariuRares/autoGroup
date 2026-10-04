import type { Browser } from 'wxt/browser';
import type { ExistingGroupRef, GroupColor, Proposal, ProposedGroup, ProposedTab } from '../shared/types';
import { hasRealTitle, isExcluded, isInternalUrl, TAB_GROUP_ID_NONE } from './tab-selection';

/** Perché una tab non può entrare in un gruppo: l'estensione non la tocca mai. */
export type HeldReason = 'pinned' | 'internal' | 'excluded' | 'loading';

/** Un gruppo già aperto in Chrome, con le sue tab di adesso e quelle che la proposta gli aggiunge. */
export interface ExistingGroupView {
  group: ExistingGroupRef;
  current: ProposedTab[];
  added: ProposedTab[];
  /** Il gruppo della proposta che lo estende, se c'è. */
  proposedGroupId?: string;
}

/** Tutta la finestra come la mostra il pannello: niente resta nascosto. */
export interface WindowView {
  existing: ExistingGroupView[];
  /** Gruppi nuovi della proposta (lista, nuovo AI, sito). */
  created: ProposedGroup[];
  /** Tab libere che la proposta lascia fuori: l'utente può metterle in un gruppo. */
  free: ProposedTab[];
  /** Tab che l'estensione non tocca mai, con il motivo. */
  held: { tab: ProposedTab; reason: HeldReason }[];
}

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
): WindowView {
  const ordered = [...tabs].filter((t) => t.id !== undefined).sort((a, b) => a.index - b.index);
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

  return {
    existing,
    created: (proposal?.groups ?? []).filter((g) => g.existingGroupId === undefined),
    free,
    held,
  };
}
