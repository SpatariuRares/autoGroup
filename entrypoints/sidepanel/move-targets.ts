import { t } from '../../src/shared/i18n';
import type { ExistingGroupView, Proposal, ProposalEdit, ProposedTab, WindowView } from '../../src/shared/types';

/**
 * An entry of "Move to…": `value` tells it apart among the menu options, `move` moves the tab. What
 * it does depends on where the tab is: inside the proposal it is an edit of the proposal, outside it really moves
 * the tab in the tab strip.
 */
export interface Target {
  value: string;
  label: string;
  move: (tab: ProposedTab) => void;
}

/** Up and down one place in the tab strip: the alternative to dragging, from the "Move to…" menu. */
export interface Reorder {
  up: boolean;
  down: boolean;
  onMove: (direction: 'up' | 'down') => void;
}

/**
 * Up and Down for the element `i` of `ids` (in tab strip order): Up goes before the previous one, Down
 * before the one that follows the next, or at the end (`null`).
 */
export function reorderAt(ids: number[], i: number, move: (beforeId: number | null) => void): Reorder {
  return {
    up: i > 0,
    down: i < ids.length - 1,
    onMove: (direction) => move(direction === 'up' ? ids[i - 1]! : (ids[i + 2] ?? null)),
  };
}

/** How the move reaches the Organizer. */
export interface Moves {
  edit: (change: Extract<ProposalEdit, { kind: 'add-tab' }>) => void;
  groupTab: (tabId: number, groupId: number) => void;
  newGroup: (tabId: number) => void;
  moveTab: (tabId: number, groupId: number | null, beforeTabId: number | null) => void;
}

const unnamed = (name: string) => name || t('popupUnnamed');
const newGroup = (move: Target['move']): Target => ({ value: 'n', label: t('panelNewGroup'), move });
const openGroup = (e: ExistingGroupView, move: Target['move']): Target => ({ value: `c:${e.group.id}`, label: unnamed(e.group.name), move });

/**
 * The destinations of "Move to…", for each kind of tab in the panel. "New group" is always the last.
 * - `proposed`: for the tabs of the proposal. The groups of the proposal, the open groups that the proposal
 *   does not touch yet and a new group, except the group where the tab already is (`except`).
 * - `free`: for the ungrouped tabs. With a proposal as above; without one, and not during computing, they
 *   are put at once into an open group or into a new one.
 * - `live`: for the current tabs of an open group, only when they can be dragged (`live`): another
 *   open group, a new one or outside the group.
 */
export function moveTargets({ proposal, view, computing, live, moves }: { proposal?: Proposal; view: WindowView; computing: boolean; live: boolean; moves: Moves }) {
  const proposed = (except: { proposedGroupId?: string; openGroupId?: number } = {}): Target[] =>
    proposal
      ? [
          ...proposal.groups
            .filter((g) => g.id !== except.proposedGroupId)
            .map((g) => ({ value: `p:${g.id}`, label: unnamed(g.name), move: (tab: ProposedTab) => moves.edit({ kind: 'add-tab', tab, to: { groupId: g.id } }) })),
          ...view.existing
            .filter((e) => !e.proposedGroupId && e.group.id !== except.openGroupId)
            .map((e) => openGroup(e, (tab) => moves.edit({ kind: 'add-tab', tab, to: { existingGroup: e.group } }))),
          newGroup((tab) => moves.edit({ kind: 'add-tab', tab, to: { newGroup: true } })),
        ]
      : [];

  const direct: Target[] =
    !proposal && !computing
      ? [...view.existing.map((e) => openGroup(e, (tab) => moves.groupTab(tab.tabId, e.group.id))), newGroup((tab) => moves.newGroup(tab.tabId))]
      : [];

  const inGroup = (groupId: number): Target[] =>
    live
      ? [
          ...view.existing.filter((e) => e.group.id !== groupId).map((e) => openGroup(e, (tab) => moves.moveTab(tab.tabId, e.group.id, null))),
          newGroup((tab) => moves.newGroup(tab.tabId)),
          { value: 'f', label: t('panelUngroupTab'), move: (tab) => moves.moveTab(tab.tabId, null, null) },
        ]
      : [];

  return { proposed, free: proposal ? proposed() : direct, live: inGroup };
}
