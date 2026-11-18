import { browser } from 'wxt/browser';
import type { UndoSnapshot } from '../shared/types';
import { TAB_GROUP_ID_NONE } from './tab-selection';

/** Snapshot of the tabs involved: for each one, window, position and group (or none). */
export async function takeSnapshot(windowId: number, tabIds: number[]): Promise<UndoSnapshot> {
  const wanted = new Set(tabIds);
  const tabs = await browser.tabs.query({ windowId });
  return {
    windowId,
    tabs: tabs
      .filter((t) => t.id !== undefined && wanted.has(t.id))
      .map((t) => ({ tabId: t.id!, windowId: t.windowId, index: t.index, groupId: t.groupId ?? TAB_GROUP_ID_NONE })),
    createdGroupIds: [],
  };
}

/**
 * Puts every tab still open back in its original group (or out of any group) and in its position.
 * Closed tabs are ignored, tabs opened since are not touched, and the groups are not renamed.
 * The groups created by the operation disappear on their own when they are left without tabs.
 */
export async function restoreSnapshot(snapshot: UndoSnapshot): Promise<void> {
  const current = new Map<number, { groupId: number }>();
  for (const tab of await browser.tabs.query({})) {
    if (tab.id !== undefined) current.set(tab.id, { groupId: tab.groupId ?? TAB_GROUP_ID_NONE });
  }
  const openGroups = new Set((await browser.tabGroups.query({})).map((g) => g.id));
  const entries = snapshot.tabs.filter((t) => current.has(t.tabId)).sort((a, b) => a.index - b.index);
  if (entries.length === 0) return;

  // 1. Out of the groups the operation put them in.
  const toUngroup = entries.filter((t) => current.get(t.tabId)!.groupId !== t.groupId).map((t) => t.tabId);
  if (toUngroup.length > 0) await browser.tabs.ungroup(toUngroup as [number, ...number[]]);

  // 2. First all at the end, in the original order; then in the original positions, from left to right. This way
  //    to the left of every destination there are only tabs already placed or untouched, and every index refers to
  //    the tab strip already rebuilt. Without the first pass, a tab still to be placed (e.g. the first one of a
  //    group, which Chrome leaves before the group when it exits) would shift the others by one.
  for (const entry of entries) await browser.tabs.move(entry.tabId, { windowId: entry.windowId, index: -1 });
  for (const entry of entries) {
    const windowTabs = await browser.tabs.query({ windowId: entry.windowId });
    const index = Math.min(entry.index, windowTabs.length - 1);
    await browser.tabs.move(entry.tabId, { windowId: entry.windowId, index });
  }

  // 3. Back into the original groups, if they still exist.
  const byGroup = new Map<number, number[]>();
  for (const entry of entries) {
    if (entry.groupId === TAB_GROUP_ID_NONE || !openGroups.has(entry.groupId)) continue;
    byGroup.set(entry.groupId, [...(byGroup.get(entry.groupId) ?? []), entry.tabId]);
  }
  for (const [groupId, tabIds] of byGroup) {
    await browser.tabs.group({ groupId, tabIds: tabIds as [number, ...number[]] });
  }

  // 4. A tab moved into the middle of someone else's group joins it (Chrome's behavior): it is removed from it.
  const after = await browser.tabs.query({});
  const intruders = after
    .filter((t) => entries.some((e) => e.tabId === t.id && e.groupId === TAB_GROUP_ID_NONE))
    .filter((t) => (t.groupId ?? TAB_GROUP_ID_NONE) !== TAB_GROUP_ID_NONE)
    .map((t) => t.id!);
  if (intruders.length > 0) await browser.tabs.ungroup(intruders as [number, ...number[]]);
}
