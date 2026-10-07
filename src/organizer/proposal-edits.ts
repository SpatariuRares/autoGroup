import type { Proposal, ProposalEdit, ProposedTab } from '../shared/types';

/** Una tab spostata dall'utente non è più lì per una regola. */
const moved = ({ rule: _rule, ...tab }: ProposedTab): ProposedTab => tab;

/**
 * Applica una modifica dell'utente alla proposta e restituisce la nuova proposta.
 * Le tab tolte o i gruppi scartati lasciano le tab libere; un gruppo rimasto senza tab sparisce.
 * Le modifiche che si riferiscono a gruppi o tab inesistenti vengono ignorate.
 */
export function editProposal(proposal: Proposal, edit: ProposalEdit): Proposal {
  let groups = proposal.groups;
  switch (edit.kind) {
    case 'rename':
      groups = groups.map((g) => (g.id === edit.groupId ? { ...g, name: edit.name.trim() } : g));
      break;
    case 'recolor':
      groups = groups.map((g) => (g.id === edit.groupId ? { ...g, color: edit.color } : g));
      break;
    case 'discard-group':
      groups = groups.filter((g) => g.id !== edit.groupId);
      break;
    case 'remove-tab':
      groups = groups.map((g) => ({ ...g, tabs: g.tabs.filter((t) => t.tabId !== edit.tabId) }));
      break;
    case 'add-tab': {
      const without = groups.map((g) => ({ ...g, tabs: g.tabs.filter((t) => t.tabId !== edit.tab.tabId) }));
      if ('groupId' in edit.to) {
        const { groupId } = edit.to;
        if (!groups.some((g) => g.id === groupId)) return proposal;
        groups = without.map((g) => (g.id === groupId ? { ...g, tabs: [...g.tabs, moved(edit.tab)] } : g));
      } else {
        const ref = edit.to.existingGroup;
        const target = without.find((g) => g.existingGroupId === ref.id);
        groups = target
          ? without.map((g) => (g === target ? { ...g, tabs: [...g.tabs, moved(edit.tab)] } : g))
          : [...without, { id: `e${ref.id}`, name: ref.name, color: ref.color, provenance: 'existing', existingGroupId: ref.id, tabs: [moved(edit.tab)] }];
      }
      break;
    }
    case 'move-tab': {
      const tab = groups.flatMap((g) => g.tabs).find((t) => t.tabId === edit.tabId);
      const target = groups.find((g) => g.id === edit.toGroupId);
      if (!tab || !target || target.tabs.some((t) => t.tabId === edit.tabId)) return proposal;
      groups = groups.map((g) =>
        g.id === edit.toGroupId
          ? { ...g, tabs: [...g.tabs, moved(tab)] }
          : { ...g, tabs: g.tabs.filter((t) => t.tabId !== edit.tabId) },
      );
      break;
    }
  }
  return { ...proposal, groups: groups.filter((g) => g.tabs.length > 0) };
}
