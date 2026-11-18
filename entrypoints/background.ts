import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { createOrganizer } from '../src/organizer';
import { announceState, serveOrganizer } from '../src/shared/organizer-remote';
import { openOnboardingOnInstall } from '../src/shared/onboarding';

export default defineBackground(() => {
  // Clicking the icon (and the shortcut) opens the side panel: unlike a popup, it stays open while the
  // user switches tabs and while the AI computes the proposal.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => console.error('autoGroup:', err));
  browser.runtime.onInstalled.addListener((details) => {
    openOnboardingOnInstall(details).catch((err) => console.error('autoGroup:', err));
  });

  const organizer = createOrganizer({ onStateChange: announceState });
  serveOrganizer(organizer);

  // Automatic grouping with the site rules: only when the URL changes, not on every reload, so a tab
  // removed from its group by hand doesn't get back in until the page changes.
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url !== undefined) organizer.autoGroupTab(tabId);
  });

  // Stale proposal: after a change to tabs, groups, settings or permissions, the Organizer rechecks it
  // with its fingerprint. Several changes close together (e.g. "Close duplicates") count as one check.
  let recheckTimer: ReturnType<typeof setTimeout> | undefined;
  const recheck = () => {
    clearTimeout(recheckTimer);
    recheckTimer = setTimeout(() => organizer.checkStale().catch((err) => console.error('autoGroup:', err)), 150);
  };
  browser.tabs.onCreated.addListener(recheck);
  browser.tabs.onRemoved.addListener(recheck);
  browser.tabs.onAttached.addListener(recheck);
  browser.tabs.onDetached.addListener(recheck);
  // Titles, favicons, audio and the active tab don't count; a finished load does (a tab without a real title is not a candidate).
  browser.tabs.onUpdated.addListener((_tabId, change) => {
    if (change.url !== undefined || change.pinned !== undefined || change.groupId !== undefined || change.status === 'complete') recheck();
  });
  browser.tabGroups.onCreated.addListener(recheck);
  browser.tabGroups.onUpdated.addListener(recheck);
  browser.tabGroups.onRemoved.addListener(recheck);
  // Not "session": that's where the Organizer saves its state.
  browser.storage.onChanged.addListener((_changes, area) => area !== 'session' && recheck());
  browser.permissions.onAdded.addListener(recheck);
  browser.permissions.onRemoved.addListener(recheck);
});
