import type { Proposal, ProposalEdit, ProposedTab } from '../shared/types';
import { createColorAssigner } from './colors';
import { domainOf } from './tab-selection';

/** A tab moved by the user is no longer there because of a rule. */
const moved = ({ rule: _rule, ...tab }: ProposedTab): ProposedTab => tab;

/**
 * Applies a user edit to the proposal and returns the new proposal.
 * Removed tabs or discarded groups leave their tabs free; a group left without tabs disappears.
 * Edits that refer to non-existent groups or tabs are ignored.
 * A new group takes the name of the tab's site and a color not yet used either by the proposal or by
 * `usedColors` (the groups open in the window).
 */
export function editProposal(proposal: Proposal, edit: ProposalEdit, usedColors: Iterable<string> = []): Proposal {
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
      if ('newGroup' in edit.to) {
        const ids = new Set(groups.map((g) => g.id));
        let n = 1;
        while (ids.has(`n${n}`)) n++;
        const color = createColorAssigner([...usedColors, ...groups.filter((g) => g.existingGroupId === undefined).map((g) => g.color)]).next();
        groups = [...without, { id: `n${n}`, name: domainOf(edit.tab.url) ?? '', color, provenance: 'manual', tabs: [moved(edit.tab)] }];
      } else if ('groupId' in edit.to) {
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
