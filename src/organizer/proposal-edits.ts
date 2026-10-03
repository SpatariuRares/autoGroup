import type { Proposal, ProposalEdit } from '../shared/types';

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
    case 'move-tab': {
      const tab = groups.flatMap((g) => g.tabs).find((t) => t.tabId === edit.tabId);
      const target = groups.find((g) => g.id === edit.toGroupId);
      if (!tab || !target || target.tabs.some((t) => t.tabId === edit.tabId)) return proposal;
      groups = groups.map((g) =>
        g.id === edit.toGroupId
          ? { ...g, tabs: [...g.tabs, tab] }
          : { ...g, tabs: g.tabs.filter((t) => t.tabId !== edit.tabId) },
      );
      break;
    }
  }
  return { ...proposal, groups: groups.filter((g) => g.tabs.length > 0) };
}
