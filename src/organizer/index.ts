import { browser } from 'wxt/browser';
import { loadSettings, SettingsError } from '../settings';
import { previewIn, proposalIn, type GroupColor, type OrganizerState, type Proposal, type ProposalEdit, type ReadyState, type WindowView } from '../shared/types';
import { applyProposal } from './applier';
import { autoGroupTab } from './auto-group';
import { findDuplicates } from './duplicates';
import { findInactive } from './inactive';
import { willAskAi } from './pipeline';
import { buildPreview, buildProposal, collectInputs, keepCurrent, signatureOf } from './proposal-builder';
import { editProposal } from './proposal-edits';
import { rememberOffer, rememberTabSite } from './remember-site';
import { renameCategory } from './rename-category';
import { groupTab, moveGroup, moveTab, newGroup } from './moves';
import { saveGroupToList, saveOpenGroupToList } from './save-to-list';
import { sortGroups, sortTabs } from './sort';
import { createStopwatch } from './stopwatch';
import { findCandidate } from './tab-selection';
import { restoreSnapshot } from './undo';
import { buildWindowView } from './window-view';

const STATE_KEY = 'organizer';

/** Organizer state in chrome.storage.session: it survives the side panel, not Chrome being closed. */
async function loadState(): Promise<OrganizerState> {
  const stored = await browser.storage.session.get(STATE_KEY);
  return (stored[STATE_KEY] as OrganizerState | undefined) ?? { phase: 'idle' };
}

async function saveState(state: OrganizerState): Promise<void> {
  await browser.storage.session.set({ [STATE_KEY]: state });
}

/** Reason for the interruption requested by "Use this": the computation ends with the per-site preview. */
const ACCEPT_PREVIEW = 'accept-preview';

/**
 * "add-tab" comes from the panel with the tab's data: only a tab already in the proposal or still
 * a candidate in the window is accepted, and only toward a group of that window.
 * The tab's data is read again from the browser, not taken from the message.
 */
async function checkAddTab(proposal: Proposal, edit: Extract<ProposalEdit, { kind: 'add-tab' }>): Promise<ProposalEdit | null> {
  const inProposal = proposal.groups.flatMap((g) => g.tabs).find((t) => t.tabId === edit.tab.tabId);
  let tab = inProposal;
  if (!tab) {
    const candidate = await findCandidate(edit.tab.tabId, proposal.windowId);
    if (!candidate) return null;
    tab = { tabId: candidate.tabId, title: candidate.title, url: candidate.url, favIconUrl: candidate.favIconUrl };
  }
  if ('existingGroup' in edit.to) {
    const group = await browser.tabGroups.get(edit.to.existingGroup.id).catch(() => null);
    if (!group || group.windowId !== proposal.windowId) return null;
  }
  return { ...edit, tab };
}

/** The state, if it has a proposal ready for this window. */
function readyIn(state: OrganizerState, windowId: number): ReadyState | undefined {
  return state.phase === 'ready' && state.windowId === windowId ? state : undefined;
}

export interface OrganizerOptions {
  /** Called at every state change, to notify the side panel if it is open. */
  onStateChange?: (state: OrganizerState) => void;
}

export interface Organizer {
  /**
   * Computes a proposal for the window and saves it in the state.
   * Reuses the saved proposal (with the user's edits) if it is for the same window and the free tabs
   * and the settings have not changed, unless `force`. A computation already in progress for the same
   * window is shared; for another window, or with `force`, a new one starts afterwards.
   */
  propose(windowId: number, options?: { force?: boolean }): Promise<OrganizerState>;
  /**
   * Edits the current proposal (rename, color, remove or move tabs, discard a group). Renaming a
   * "list" group also renames its category, like `renameGroup`. After "add-tab" toward a category,
   * the returned state carries the "Always put here" offer (see `rememberOffer`), which disappears
   * at the next operation.
   */
  edit(edit: ProposalEdit): Promise<OrganizerState>;
  /** "Add to categories": adds to the list a new group of the proposal that is not already a category. */
  saveToList(groupId: string): Promise<OrganizerState>;
  /**
   * "Add to categories" for a group already open in Chrome (name, color and tabs from Chrome); a
   * proposal of its window stays current if it was. The returned state carries the outcome (`notice`).
   */
  saveOpenGroupToList(groupId: number): Promise<OrganizerState>;
  /**
   * Renames a group open in Chrome. If it is a category it also renames the category (see
   * `renameCategory`); a rejected name leaves everything as it is and comes back as a warning (`notice`).
   * The group of the proposal that extends it takes the new name; a current proposal stays current.
   */
  renameGroup(groupId: number, name: string): Promise<OrganizerState>;
  /**
   * "Always put here": the tab will always go to the category of its group in the proposal (see
   * `rememberTabSite`). Does nothing for groups that are not a category.
   */
  rememberSite(tabId: number): Promise<OrganizerState>;
  /** Creates in Chrome the groups of the current proposal, after saving the snapshot for "Undo". */
  apply(): Promise<OrganizerState>;
  /** Undoes the last applied organization. */
  undo(): Promise<OrganizerState>;
  /**
   * Closes a tab from the panel and removes it from the proposal. If the proposal was still current it
   * stays current (new fingerprint), so closing a tab costs no new computation. If it was the last of an
   * open group, the group disappears and the tabs the proposal added to it become free again.
   */
  closeTab(tabId: number): Promise<OrganizerState>;
  /**
   * "Close duplicates": closes the tabs chosen in the side panel's preview, but only those that are still
   * duplicates (see `findDuplicates`, recomputed here): a tab that no longer is stays open. Like
   * `closeTab`, a proposal still current stays current, without the closed tabs.
   */
  closeDuplicates(windowId: number, tabIds: number[]): Promise<OrganizerState>;
  /**
   * "Close inactive": closes the tabs chosen in the side panel's preview, but only those still inactive
   * (see `findInactive`, recomputed here). Like `closeDuplicates`, the proposal stays current.
   */
  closeInactive(windowId: number, tabIds: number[]): Promise<OrganizerState>;
  /**
   * Closes all the tabs of a group open in Chrome. The tabs the proposal added to it become free again;
   * the proposal stays current.
   */
  closeGroup(groupId: number): Promise<OrganizerState>;
  /**
   * "Move to…" without a proposal: immediately puts a free tab into an open group of its window.
   * Only a tab that the selection would take (not pinned, not internal, not excluded) is accepted.
   */
  groupTab(tabId: number, groupId: number): Promise<OrganizerState>;
  /**
   * "New group" without a proposal, or with drag and drop: immediately puts the tab in a new group, with
   * the name of its site and a color not yet used in the window, next to the group it leaves.
   * It accepts the free tabs that `groupTab` takes and, as `moveTab` does, those already in a group; never the pinned ones.
   */
  newGroup(tabId: number): Promise<OrganizerState>;
  /**
   * "Sort groups A to Z": puts the groups of the window in alphabetical order in the strip (see `sortGroups`).
   * Does not touch the proposal: the order of the tabs is not part of its fingerprint.
   */
  sortGroups(windowId: number): Promise<OrganizerState>;
  /** "Sort tabs A to Z": sorts by title the tabs of each group and the free ones (see `sortTabs`). Like `sortGroups`. */
  sortTabs(windowId: number): Promise<OrganizerState>;
  /**
   * Drag and drop of a tab: moves it into an open group of its window (or out of every group with
   * `groupId` null), before `beforeTabId` or at the end (see `moveTab`). Pinned tabs do not move.
   * As for "Move to…" without a proposal, a proposal that depends on it becomes stale.
   */
  moveTab(tabId: number, groupId: number | null, beforeTabId: number | null): Promise<OrganizerState>;
  /** Drag and drop of an open group, whole: before `beforeGroupId` or after the last group (see `moveGroup`). */
  moveGroup(groupId: number, beforeGroupId: number | null): Promise<OrganizerState>;
  /**
   * Automatic grouping of a tab that has just changed URL, with the site rules only
   * (see `autoGroupTab`). It does not change the state: a proposal that contained the tab becomes stale.
   */
  autoGroupTab(tabId: number): Promise<void>;
  /** "Stop": cancels the requests in progress and the queued computations; none produces a proposal. */
  abort(): Promise<OrganizerState>;
  /**
   * "Use this": like "Stop", but the computation that is showing the per-site preview ends with that
   * as the current proposal, editable and applicable. Without a preview it is the same as "Stop".
   */
  acceptPreview(): Promise<OrganizerState>;
  /**
   * Rechecks whether the current proposal is still current (candidate tabs, open groups, settings,
   * providers) and writes it to `stale`. The service worker calls it when tabs, groups, settings or
   * permissions change; the Organizer's operations that keep the proposal current do not make it appear
   * stale, because they go through the same queue.
   */
  checkStale(): Promise<OrganizerState>;
  /**
   * The whole window as the panel shows it: open groups, new groups of the proposal (or of the per-site
   * preview during the computation), free tabs, held tabs, duplicates, inactive tabs and the live details.
   * It does not wait for the queue: it can be asked while the AI computes.
   */
  view(windowId: number): Promise<WindowView>;
  /** Current state: phase, proposal, undo available. */
  state(): Promise<OrganizerState>;
}

export function createOrganizer(options: OrganizerOptions = {}): Organizer {
  /** The last computation requested, shared with the following requests for the same window. */
  let computing: { windowId: number; result: Promise<OrganizerState> } | null = null;
  /** One controller per computation in progress or queued, used by "Stop". */
  const controllers = new Set<AbortController>();
  let queue: Promise<unknown> = Promise.resolve();

  /**
   * Runs the operations one at a time, in arrival order. Each one reads the state, touches the tabs
   * and rewrites the state: two intertwined operations could cancel each other out (e.g. a proposal
   * computed during "Apply" that rewrites the old snapshot for "Undo").
   */
  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  }

  /** The saved state, without the "Always put here" offer: it is valid only for the response to `edit`. */
  async function load(): Promise<OrganizerState> {
    const { offer: _, ...state } = await loadState();
    return state;
  }

  /**
   * The state from which a user operation starts. The outcome of the previous one (`notice`) lasts until
   * this one, even when the panel is reopened, so it also disappears from the saved state.
   */
  async function begin(): Promise<OrganizerState> {
    const { notice, ...state } = await load();
    return notice ? setState(state) : state;
  }

  async function setState(state: OrganizerState): Promise<OrganizerState> {
    await saveState(state);
    options.onStateChange?.(state);
    return state;
  }

  /** A change that renames a category: a rejected name leaves everything as it is and comes back as a warning (`notice`). */
  async function orNotice(current: OrganizerState, change: () => Promise<OrganizerState>): Promise<OrganizerState> {
    try {
      return await change();
    } catch (err) {
      if (err instanceof SettingsError) return setState({ ...current, notice: { key: err.messageKey } });
      throw err;
    }
  }

  /** An operation that touches only Chrome's tab strip, not the proposal. */
  function onStrip(change: () => Promise<void>): Promise<OrganizerState> {
    return exclusive(async () => {
      const current = await begin();
      await change();
      return current;
    });
  }

  /**
   * Closes several tabs of a window and removes them from the proposal. An open group left empty disappears
   * from Chrome: the group of the proposal that extended it is discarded and its tabs become free again.
   * This way a current proposal stays current (new fingerprint), without a new computation.
   */
  async function closeTabs(windowId: number, tabIds: number[]): Promise<OrganizerState> {
    const current = await begin();
    if (tabIds.length === 0) return current;
    const ready = readyIn(current, windowId);
    if (!ready) {
      await browser.tabs.remove(tabIds);
      return current;
    }
    const proposal = await keepCurrent(ready.proposal, async () => {
      await browser.tabs.remove(tabIds);
      let edited = tabIds.reduce((p, tabId) => editProposal(p, { kind: 'remove-tab', tabId }), ready.proposal);
      for (const group of edited.groups) {
        if (group.existingGroupId === undefined) continue;
        if (!(await browser.tabGroups.get(group.existingGroupId).catch(() => null))) {
          edited = editProposal(edited, { kind: 'discard-group', groupId: group.id });
        }
      }
      return edited;
    });
    return setState({ ...ready, proposal });
  }

  async function propose(windowId: number, force: boolean, signal: AbortSignal): Promise<OrganizerState> {
    const current = await begin();
    // The snapshot for "Undo" stays valid until the next organization is applied.
    const { undo } = current;
    let preview: Proposal | undefined;
    try {
      // "Stop" pressed while the computation was still queued.
      signal.throwIfAborted();
      const clock = createStopwatch();
      const inputs = await collectInputs(windowId);
      clock.lap('inputs');
      const reusable = force ? undefined : readyIn(current, windowId);
      if (reusable && reusable.proposal.signature === signatureOf(inputs)) {
        const { stale: _, ...fresh } = reusable;
        return reusable.stale ? await setState(fresh) : reusable;
      }

      // While the AI works, the panel shows the per-site proposal right away, which costs a few milliseconds.
      preview = willAskAi(inputs) ? buildPreview(inputs) : undefined;
      await setState({ phase: 'computing', windowId, undo, ...(preview ? { preview } : {}) });
      clock.lap('preview');
      const proposal = await buildProposal(inputs, signal, clock);
      signal.throwIfAborted();
      console.info('autoGroup: computation timings (ms)', proposal.timings);
      return await setState({ phase: 'ready', windowId, proposal, undo });
    } catch (err) {
      if (signal.aborted && signal.reason === ACCEPT_PREVIEW && preview) {
        return await setState({ phase: 'ready', windowId, proposal: preview, undo });
      }
      if (signal.aborted) return await setState({ phase: 'idle', windowId, undo, notice: { key: 'popupAborted' } });
      console.error('autoGroup: proposal computation failed', err);
      return await setState({ phase: 'idle', windowId, error: 'errorPropose', undo });
    }
  }

  return {
    propose(windowId, { force = false } = {}) {
      // Two close requests for the same window (e.g. the panel open twice) share the computation.
      if (computing && computing.windowId === windowId && !force) return computing.result;
      const controller = new AbortController();
      controllers.add(controller);
      const result = exclusive(() => propose(windowId, force, controller.signal)).finally(() => {
        controllers.delete(controller);
        if (computing?.result === result) computing = null;
      });
      computing = { windowId, result };
      return result;
    },

    edit(edit) {
      return exclusive(async () => {
        const current = await begin();
        if (current.phase !== 'ready') return current;
        const checked = edit.kind === 'add-tab' ? await checkAddTab(current.proposal, edit) : edit;
        if (!checked) return current;
        // Renaming a group that is a category also renames the category (see `renameCategory`).
        const target = checked.kind === 'rename' ? current.proposal.groups.find((g) => g.id === checked.groupId) : undefined;
        if (checked.kind === 'rename' && target?.provenance === 'list') {
          return orNotice(current, async () => {
            const proposal = await keepCurrent(current.proposal, async () => {
              await renameCategory(target.name, checked.name);
              return editProposal(current.proposal, checked);
            });
            return setState({ ...current, proposal });
          });
        }
        // A new group takes a color that the groups open in the window do not use yet.
        const used = checked.kind === 'add-tab' && 'newGroup' in checked.to ? (await browser.tabGroups.query({ windowId: current.windowId })).map((g) => g.color) : [];
        const proposal = editProposal(current.proposal, checked, used);
        const offer = checked.kind === 'add-tab' ? rememberOffer(proposal, checked.tab.tabId, await loadSettings()) : null;
        return setState({ ...current, proposal, ...(offer ? { offer } : {}) });
      });
    },

    saveToList(groupId) {
      return exclusive(async () => {
        const current = await begin();
        if (current.phase !== 'ready') return current;
        const result = await saveGroupToList(current.proposal, groupId);
        if (!result) return current;
        return setState({ ...current, proposal: result.proposal, notice: result.notice });
      });
    },

    saveOpenGroupToList(groupId) {
      return exclusive(async () => {
        const current = await begin();
        const group = await browser.tabGroups.get(groupId).catch(() => null);
        if (!group) return current;
        const tabs = (await browser.tabs.query({ windowId: group.windowId, groupId })).map((t) => ({ title: t.title ?? '', url: t.url ?? '' }));
        const ready = readyIn(current, group.windowId);
        const result = await saveOpenGroupToList({ windowId: group.windowId, name: group.title ?? '', color: group.color as GroupColor, tabs }, ready?.proposal);
        if (!result) return current;
        return setState(ready && result.proposal ? { ...ready, proposal: result.proposal, notice: result.notice } : { ...current, notice: result.notice });
      });
    },

    renameGroup(groupId, name) {
      return exclusive(async () => {
        const current = await begin();
        const group = await browser.tabGroups.get(groupId).catch(() => null);
        if (!group) return current;
        const title = name.trim();
        // The category first: if the new name is rejected, the group stays as it is too.
        const rename = async () => {
          await renameCategory(group.title ?? '', title);
          await browser.tabGroups.update(groupId, { title });
        };
        const ready = readyIn(current, group.windowId);
        return orNotice(current, async () => {
          if (!ready) {
            await rename();
            return current;
          }
          const proposal = await keepCurrent(ready.proposal, async () => {
            await rename();
            return { ...ready.proposal, groups: ready.proposal.groups.map((g) => (g.existingGroupId === groupId ? { ...g, name: title } : g)) };
          });
          return setState({ ...ready, proposal });
        });
      });
    },

    rememberSite(tabId) {
      return exclusive(async () => {
        const current = await begin();
        if (current.phase !== 'ready') return current;
        const result = await rememberTabSite(current.proposal, tabId);
        if (!result) return current;
        return setState({ ...current, proposal: result.proposal, notice: result.notice });
      });
    },

    apply() {
      return exclusive(async () => {
        const current = await begin();
        if (current.phase !== 'ready') return current;
        try {
          const undo = await applyProposal(current.proposal, (snapshot) => saveState({ ...current, undo: snapshot }));
          return await setState({ phase: 'idle', windowId: current.windowId, undo });
        } catch (err) {
          console.error('autoGroup: apply failed', err);
          return await setState({ ...(await load()), error: 'errorApply' });
        }
      });
    },

    undo() {
      return exclusive(async () => {
        const current = await begin();
        if (!current.undo) return current;
        try {
          await restoreSnapshot(current.undo);
          // A proposal computed after the organization is no longer valid: the tabs are free again.
          return await setState({ phase: 'idle', windowId: current.undo.windowId });
        } catch (err) {
          console.error('autoGroup: undo failed', err);
          return await setState({ ...current, error: 'errorUndo' });
        }
      });
    },

    closeTab(tabId) {
      return exclusive(async () => {
        const tab = await browser.tabs.get(tabId).catch(() => null);
        if (!tab) return begin();
        return closeTabs(tab.windowId, [tabId]);
      });
    },

    closeDuplicates(windowId, chosen) {
      return exclusive(async () => {
        const { excludedDomains } = await loadSettings();
        const tabIds = findDuplicates(await browser.tabs.query({ windowId }), excludedDomains).filter((id) => chosen.includes(id));
        return closeTabs(windowId, tabIds);
      });
    },

    closeInactive(windowId, chosen) {
      return exclusive(async () => {
        const { excludedDomains } = await loadSettings();
        const tabIds = findInactive(await browser.tabs.query({ windowId }), excludedDomains, Date.now()).filter((id) => chosen.includes(id));
        return closeTabs(windowId, tabIds);
      });
    },

    closeGroup(groupId) {
      return exclusive(async () => {
        const group = await browser.tabGroups.get(groupId).catch(() => null);
        if (!group) return begin();
        const tabIds = (await browser.tabs.query({ windowId: group.windowId, groupId })).map((tab) => tab.id!);
        return closeTabs(group.windowId, tabIds);
      });
    },

    groupTab: (tabId, groupId) => onStrip(() => groupTab(tabId, groupId)),
    newGroup: (tabId) => onStrip(() => newGroup(tabId)),
    sortGroups: (windowId) => onStrip(() => sortGroups(windowId)),
    sortTabs: (windowId) => onStrip(() => sortTabs(windowId)),
    moveTab: (tabId, groupId, beforeTabId) => onStrip(() => moveTab(tabId, groupId, beforeTabId)),
    moveGroup: (groupId, beforeGroupId) => onStrip(() => moveGroup(groupId, beforeGroupId)),

    autoGroupTab(tabId) {
      return exclusive(async () => {
        try {
          await autoGroupTab(tabId);
        } catch (err) {
          // E.g. a window that does not accept groups, or a tab closed midway: the tab stays where it is.
          console.error('autoGroup: automatic grouping failed', err);
        }
      });
    },

    checkStale() {
      return exclusive(async () => {
        const current = await load();
        if (current.phase !== 'ready') return current;
        const stale = current.proposal.signature !== signatureOf(await collectInputs(current.windowId));
        if (stale === (current.stale ?? false)) return current;
        const { stale: _, ...rest } = current;
        return setState(stale ? { ...rest, stale } : rest);
      });
    },

    async view(windowId) {
      const [current, tabs, groups, { excludedDomains, categories }] = await Promise.all([
        load(),
        browser.tabs.query({ windowId }),
        browser.tabGroups.query({ windowId }),
        loadSettings(),
      ]);
      return buildWindowView(tabs, groups, proposalIn(current, windowId) ?? previewIn(current, windowId), excludedDomains, Date.now(), categories.map((c) => c.name));
    },

    async abort() {
      // It does not go through the queue: it must act precisely while the computation occupies it.
      for (const controller of controllers) controller.abort();
      return computing?.result ?? load();
    },

    async acceptPreview() {
      for (const controller of controllers) controller.abort(ACCEPT_PREVIEW);
      return computing?.result ?? load();
    },

    state: load,
  };
}
