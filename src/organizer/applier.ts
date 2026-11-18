import { browser, type Browser } from 'wxt/browser';
import type { Proposal, UndoSnapshot } from '../shared/types';
import { TAB_GROUP_ID_NONE } from './tab-selection';
import { takeSnapshot } from './undo';

/**
 * Creates in Chrome the groups of the proposal, with name and color, and extends the existing ones.
 * Tabs that were closed, moved to another window or grouped in the meantime are skipped.
 * Before touching any tab it passes the snapshot of the state to `saveSnapshot`, so "Undo"
 * works even if the service worker is interrupted midway. Returns the full snapshot.
 */
export async function applyProposal(
  proposal: Proposal,
  saveSnapshot: (snapshot: UndoSnapshot) => Promise<void>,
): Promise<UndoSnapshot> {
  const windowTabs = await browser.tabs.query({ windowId: proposal.windowId });
  const freeTabIds = new Set(
    windowTabs
      .filter((t) => t.id !== undefined && !t.pinned && (t.groupId ?? TAB_GROUP_ID_NONE) === TAB_GROUP_ID_NONE)
      .map((t) => t.id!),
  );
  const plan = proposal.groups
    .map((group) => ({ group, tabIds: group.tabs.map((t) => t.tabId).filter((id) => freeTabIds.has(id)) }))
    .filter((step) => step.tabIds.length > 0);

  const snapshot = await takeSnapshot(proposal.windowId, plan.flatMap((step) => step.tabIds));
  await saveSnapshot(snapshot);

  for (const { group, tabIds } of plan) {
    const ids = tabIds as [number, ...number[]];
    if (group.existingGroupId !== undefined) {
      await browser.tabs.group({ groupId: group.existingGroupId, tabIds: ids });
      continue;
    }
    const groupId = await browser.tabs.group({ tabIds: ids, createProperties: { windowId: proposal.windowId } });
    await browser.tabGroups.update(groupId, { title: group.name, color: group.color as Browser.tabGroups.Color });
    snapshot.createdGroupIds.push(groupId);
  }
  return snapshot;
}
