import { browser } from 'wxt/browser';

/*
 * Direct actions on the tab strip that do not touch the proposal: nothing goes through the Organizer.
 * If the tab or the group no longer exist nothing happens; the panel updates itself.
 */

/** Brings a tab of the window to the foreground. */
export function openTab(tabId: number) {
  browser.tabs.update(tabId, { active: true }).catch(() => {});
}

/** Mutes or unmutes a tab's audio. */
export function setMuted(tabId: number, muted: boolean) {
  browser.tabs.update(tabId, { muted }).catch(() => {});
}

/** Collapses or expands a group in Chrome's tab strip. */
export function setCollapsed(groupId: number, collapsed: boolean) {
  browser.tabGroups.update(groupId, { collapsed }).catch(() => {});
}
