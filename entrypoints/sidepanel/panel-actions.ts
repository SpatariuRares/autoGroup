import { createContext, useContext } from 'react';
import type { ExistingGroupRef, ProposalEdit, ProposedGroup } from '../../src/shared/types';

/**
 * The actions of tabs and rows on the Organizer, given by `App` to the whole panel without passing them
 * from hand to hand. The actions that do not touch the proposal (going to a tab, audio, collapsing a group)
 * go directly to Chrome, see `tab-actions.ts`.
 */
export interface PanelActions {
  /** True while an operation that blocks the buttons is in progress. */
  busy: boolean;
  edit: (change: ProposalEdit) => void;
  closeTab: (tabId: number) => void;
  closeGroup: (groupId: number) => void;
  renameGroup: (groupId: number, name: string) => void;
  /** Really moves a tab in the tab strip: into an open group (or out, `null`), before `beforeTabId` or at the end. */
  moveTab: (tabId: number, groupId: number | null, beforeTabId: number | null) => void;
  /** "Add to categories" for a group of the proposal or for an open group. */
  saveProposedGroup: (group: ProposedGroup) => void;
  saveOpenGroup: (group: ExistingGroupRef) => void;
  /** The group that "Add to categories" is saving: the proposal's ID (text) or Chrome's (number). */
  adding: string | number | null;
}

export const PanelActionsContext = createContext<PanelActions | null>(null);

export function usePanelActions(): PanelActions {
  const actions = useContext(PanelActionsContext);
  if (!actions) throw new Error('usePanelActions fuori da PanelActionsContext');
  return actions;
}
