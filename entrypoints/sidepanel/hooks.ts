import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings } from '../../src/settings';
import { onOrganizerState, remoteOrganizer as organizer } from '../../src/shared/organizer-remote';
import type { OrganizerState, ProposalEdit, WindowView } from '../../src/shared/types';
import { useExpiring } from '../../src/ui/use-expiring';

/**
 * The Organizer's state for the panel's window. On opening it only reads it, without
 * computing: a proposal already made for this window is shown again, a new one starts only from
 * "Organize". Then it follows the service worker's updates, only those of this window.
 */
export function useOrganizer() {
  const [state, setState] = useState<OrganizerState | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Read by the listener: the preview announcement can arrive before React updates `windowId`.
  const currentWindow = useRef<number | null>(null);

  useEffect(() => {
    // The state is shared by all windows: only the updates of this one are shown.
    return onOrganizerState((next) => {
      if (currentWindow.current !== null && next.windowId === currentWindow.current) setState(next);
    });
  }, []);

  useEffect(() => {
    (async () => {
      const win = await browser.windows.getCurrent();
      currentWindow.current = win.id!;
      setWindowId(win.id!);
      setState(await organizer.state());
    })().catch((err) => {
      console.error(err);
      setState({ phase: 'idle', error: 'errorUnexpected' });
    });
  }, []);

  /**
   * Operation that blocks the buttons until it ends: on the whole proposal, on the window or long
   * (Organize, Apply, Cancel, A-Z, Add to categories).
   */
  async function run(request: () => Promise<OrganizerState>, after?: () => void) {
    setBusy(true);
    setFailure(null);
    try {
      setState(await request());
      after?.();
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Request without visible wait, for actions on a tab or a group that end at once (edits,
   * closing, moving): the new state, or `null` if it fails (with the error shown).
   */
  async function send(request: () => Promise<OrganizerState>): Promise<OrganizerState | null> {
    setFailure(null);
    try {
      const next = await request();
      setState(next);
      return next;
    } catch (err) {
      console.error('autoGroup:', err);
      setFailure('errorUnexpected');
      return null;
    }
  }

  const edit = (change: ProposalEdit) => send(() => organizer.edit(change));

  return { state, windowId, busy, failure, run, send, edit };
}

const EMPTY_VIEW: WindowView = { existing: [], created: [], free: [], held: [], duplicates: [], inactive: [], inactiveDays: 0, live: {} };

/**
 * The window as the Organizer builds it (see `Organizer.view`), re-read at every change of
 * the window's tabs or groups, of state or of settings. A response that arrives after a newer one
 * is discarded. If the proposal is outdated the state says so (`stale`), not the view.
 */
export function useWindowView(windowId: number | null, state: OrganizerState | null, settings: Settings | null) {
  const [view, setView] = useState<WindowView>(EMPTY_VIEW);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    if (windowId === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setChanges((n) => n + 1), 100);
    };
    const inWindow = (x?: { windowId?: number }) => x?.windowId === windowId && changed();
    const onRemoved = (_id: number, info: { windowId: number }) => inWindow(info);
    const onUpdated = (_id: number, _change: unknown, tab: { windowId?: number }) => inWindow(tab);
    const onMoved = (_id: number, info: { windowId: number }) => inWindow(info);
    const onMovedBetween = (_id: number, info: { newWindowId?: number; oldWindowId?: number }) =>
      (info.newWindowId === windowId || info.oldWindowId === windowId) && changed();

    browser.tabs.onCreated.addListener(inWindow);
    browser.tabs.onRemoved.addListener(onRemoved);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onActivated.addListener(inWindow);
    browser.tabs.onMoved.addListener(onMoved);
    browser.tabs.onAttached.addListener(onMovedBetween);
    browser.tabs.onDetached.addListener(onMovedBetween);
    browser.tabGroups.onCreated.addListener(inWindow);
    browser.tabGroups.onUpdated.addListener(inWindow);
    browser.tabGroups.onRemoved.addListener(inWindow);
    return () => {
      clearTimeout(timer);
      browser.tabs.onCreated.removeListener(inWindow);
      browser.tabs.onRemoved.removeListener(onRemoved);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onActivated.removeListener(inWindow);
      browser.tabs.onMoved.removeListener(onMoved);
      browser.tabs.onAttached.removeListener(onMovedBetween);
      browser.tabs.onDetached.removeListener(onMovedBetween);
      browser.tabGroups.onCreated.removeListener(inWindow);
      browser.tabGroups.onUpdated.removeListener(inWindow);
      browser.tabGroups.onRemoved.removeListener(inWindow);
    };
  }, [windowId]);

  useEffect(() => {
    if (windowId === null) return;
    let latest = true;
    organizer
      .view(windowId)
      .then((next) => latest && setView(next))
      .catch((err) => console.error('autoGroup:', err));
    return () => {
      latest = false;
    };
  }, [windowId, state, settings, changes]);

  return view;
}

/** How long a snackbar with an outcome or an offer stays visible. */
export const SNACKBAR_MS = 8000;

/** After how long the category mark disappears if the view does not change (e.g. category already existing). */
const ADDED_MARK_MS = 1500;

/**
 * "Add to categories": the group (`adding.id`, of the proposal or of Chrome) shows the category mark at once
 * and the snackbar says it is being saved. When saving ends, the new view is awaited,
 * so the mark does not go back. The outcome (`saved`) stays in the snackbar for a few seconds.
 */
export function useSaveToCategories(run: ReturnType<typeof useOrganizer>['run'], view: WindowView) {
  const [adding, setAdding] = useState<{ id: string | number; name: string; done: boolean } | null>(null);
  const [saved, setSaved, pauseSaved] = useExpiring<NonNullable<OrganizerState['notice']>>(SNACKBAR_MS);

  useEffect(() => {
    if (adding?.done) setAdding(null);
  }, [view]);
  useEffect(() => {
    if (!adding?.done) return;
    const timer = setTimeout(() => setAdding(null), ADDED_MARK_MS);
    return () => clearTimeout(timer);
  }, [adding?.done]);

  const save = async (id: string | number, name: string, request: () => Promise<OrganizerState>) => {
    setAdding({ id, name, done: false });
    setSaved(null);
    await run(async () => {
      const next = await request();
      // Even a settings error (e.g. too many categories) arrives as an outcome.
      if (next.notice) setSaved(next.notice);
      return next;
    });
    setAdding((a) => a && { ...a, done: true });
  };

  return { adding, saved, pauseSaved, save };
}

export { useExpiring };
