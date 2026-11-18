import { browser, type Browser } from 'wxt/browser';
import { createColorAssigner } from './colors';
import { domainOf, findCandidate, TAB_GROUP_ID_NONE as NONE } from './tab-selection';

/*
 * Drag-and-drop moves of the side panel, onto the groups already open and onto tabs without a group.
 * Pinned tabs never move. Where possible, every move goes leftward: with
 * `tabs.move` and `tabGroups.move` the arrival index is then unambiguous.
 */

async function stripOf(windowId: number): Promise<Browser.tabs.Tab[]> {
  return (await browser.tabs.query({ windowId })).filter((t) => t.id !== undefined).sort((a, b) => a.index - b.index);
}

/** Arrival index to put the tab right before `before`, counting that the tab itself leaves the strip. */
const indexBefore = (tab: Browser.tabs.Tab, before: Browser.tabs.Tab) => (tab.index < before.index ? before.index - 1 : before.index);

/** Arrival index to put the tab right after `after`, as above. */
const indexAfter = (tab: Browser.tabs.Tab, after: Browser.tabs.Tab) => (tab.index <= after.index ? after.index : after.index + 1);

/**
 * Moves a non-pinned tab into an open group of its window (`groupId`) or out of every group
 * (`null`), right before `beforeTabId` or, with `null`, at the end of the group (or after the last tab
 * without a group). `beforeTabId` must be in the arrival group, or without a group for `groupId` null;
 * otherwise nothing happens.
 */
export async function moveTab(tabId: number, groupId: number | null, beforeTabId: number | null): Promise<void> {
  if (tabId === beforeTabId) return;
  let tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab || tab.pinned) return;
  const windowId = tab.windowId;
  const target = groupId ?? NONE;
  if (groupId !== null) {
    const group = await browser.tabGroups.get(groupId).catch(() => null);
    if (!group || group.windowId !== windowId) return;
  }
  const before = beforeTabId === null ? null : await browser.tabs.get(beforeTabId).catch(() => null);
  if (beforeTabId !== null && (!before || before.windowId !== windowId || before.pinned || before.groupId !== target)) return;

  // First into the right group: `tabs.group` puts it at the end of the group, `tabs.ungroup` right after its old
  // group (the first tab of a group, or the only one, instead stays where it is, right before). Afterwards it is put in its place.
  if (tab.groupId !== target) {
    if (groupId !== null) await browser.tabs.group({ tabIds: [tabId], groupId });
    else await browser.tabs.ungroup([tabId]);
    tab = await browser.tabs.get(tabId);
  }

  const strip = await stripOf(windowId);
  const at = (id: number) => strip.find((t) => t.id === id)!;
  tab = at(tabId);
  if (before) {
    // With the arrival tab as its right neighbor, the tab stays in the right group (or without a group).
    const index = indexBefore(tab, at(before.id!));
    if (index !== tab.index) await browser.tabs.move(tabId, { index });
    return;
  }
  const last = strip.filter((t) => !t.pinned && t.groupId === target).at(-1);
  if (!last || last.id === tabId) return;
  await browser.tabs.move(tabId, { index: indexAfter(tab, last) });
  // At the end of the group the tab has another tab on its right: if Chrome has removed it from the group, it goes back in (at the end).
  if (groupId !== null && (await browser.tabs.get(tabId)).groupId !== groupId) await browser.tabs.group({ tabIds: [tabId], groupId });
}

/** The groups of the strip in order, each with its tabs. */
function groupsOf(strip: Browser.tabs.Tab[]): { groupId: number; tabs: Browser.tabs.Tab[] }[] {
  const groups: { groupId: number; tabs: Browser.tabs.Tab[] }[] = [];
  for (const tab of strip) {
    if (tab.groupId === NONE) continue;
    const last = groups.at(-1);
    if (last?.groupId === tab.groupId) last.tabs.push(tab);
    else groups.push({ groupId: tab.groupId, tabs: [tab] });
  }
  return groups;
}

/**
 * Moves an open group, whole, right before the group `beforeGroupId` of the same window or,
 * with `null`, right after the last group. It never enters another group. Moving it to the right
 * instead moves leftward, before it, the pieces it must overtake (whole groups and tabs without a group).
 */
export async function moveGroup(groupId: number, beforeGroupId: number | null): Promise<void> {
  if (groupId === beforeGroupId) return;
  const group = await browser.tabGroups.get(groupId).catch(() => null);
  if (!group) return;
  const strip = await stripOf(group.windowId);
  const groups = groupsOf(strip);
  const from = groups.findIndex((g) => g.groupId === groupId);
  const to = beforeGroupId === null ? groups.length : groups.findIndex((g) => g.groupId === beforeGroupId);
  if (from < 0 || to < 0 || to === from + 1) return;
  const self = groups[from]!;

  if (to < from) {
    await browser.tabGroups.move(groupId, { index: groups[to]!.tabs[0]!.index });
    return;
  }
  // Everything between the end of the group and the start of the arrival group (or the end of the last group).
  const start = self.tabs.at(-1)!.index + 1;
  const end = to < groups.length ? groups[to]!.tabs[0]!.index : groups.at(-1)!.tabs.at(-1)!.index + 1;
  let index = self.tabs[0]!.index;
  for (const tab of strip.slice(start, end)) {
    if (tab.groupId === NONE) {
      await browser.tabs.move(tab.id!, { index });
      index++;
    } else if (tab.id === groups.find((g) => g.groupId === tab.groupId)!.tabs[0]!.id) {
      const size = groups.find((g) => g.groupId === tab.groupId)!.tabs.length;
      await browser.tabGroups.move(tab.groupId, { index });
      index += size;
    }
  }
}

/** "Move to…" without a proposal: immediately puts a candidate tab (see `findCandidate`) into an open group of its window. */
export async function groupTab(tabId: number, groupId: number): Promise<void> {
  const [tab, group] = await Promise.all([browser.tabs.get(tabId).catch(() => null), browser.tabGroups.get(groupId).catch(() => null)]);
  if (!tab || !group || group.windowId !== tab.windowId) return;
  if (!(await findCandidate(tabId, tab.windowId))) return;
  await browser.tabs.group({ tabIds: [tabId], groupId });
}

/**
 * "New group": immediately puts the tab in a new group, with the name of its site and a color not yet
 * used in the window, next to the group it leaves. It accepts the candidate tabs and, from the drag and drop
 * as in `moveTab`, those already in a group; never the pinned ones.
 */
export async function newGroup(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId).catch(() => null);
  if (!tab || tab.pinned) return;
  const grouped = (tab.groupId ?? NONE) !== NONE;
  if (!grouped && !(await findCandidate(tabId, tab.windowId))) return;
  const groups = await browser.tabGroups.query({ windowId: tab.windowId });
  const color = createColorAssigner(groups.map((g) => g.color)).next();
  // First out of its group (Chrome puts it right after, or leaves it before if it was the first), so the new group does not split it.
  if (grouped) await browser.tabs.ungroup([tabId]);
  const groupId = await browser.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } });
  await browser.tabGroups.update(groupId, { title: domainOf(tab.url ?? '') ?? '', color });
}
