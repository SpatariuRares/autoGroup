import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { GroupColor } from '../src/shared/types';

/**
 * Small simulator of Chrome's tab strip, layered on WXT's fake browser.
 * WXT's fake knows nothing about groups, pinned tabs or positions: here the tabs of each window
 * are an ordered list, and `tabs.group`, `tabs.ungroup`, `tabs.move` and `tabGroups` behave like
 * Chrome in the cases the Organizer uses.
 */

const NONE = -1;

interface TabRecord {
  id: number;
  windowId: number;
  url: string;
  title: string;
  pinned: boolean;
  groupId: number;
  discarded: boolean;
  favIconUrl?: string;
  active: boolean;
  audible: boolean;
  lastAccessed?: number;
}

interface GroupRecord {
  id: number;
  windowId: number;
  title: string;
  color: GroupColor;
  collapsed: boolean;
}

export interface NewTab {
  url: string;
  title?: string;
  windowId?: number;
  pinned?: boolean;
  discarded?: boolean;
  active?: boolean;
  audible?: boolean;
  /** Last time the tab was looked at, in ms since the epoch (like `Tab.lastAccessed`). */
  lastAccessed?: number;
}

export function installFakeTabStrip(options: { currentWindowId?: number } = {}) {
  const currentWindowId = options.currentWindowId ?? 1;
  const tabs = new Map<number, TabRecord>();
  const groups = new Map<number, GroupRecord>();
  const order = new Map<number, number[]>(); // windowId -> IDs of the tabs, in order
  let nextTabId = 100;
  let nextGroupId = 500;

  const strip = (windowId: number) => {
    if (!order.has(windowId)) order.set(windowId, []);
    return order.get(windowId)!;
  };

  const toTab = (t: TabRecord): Browser.tabs.Tab =>
    ({
      id: t.id,
      windowId: t.windowId,
      index: strip(t.windowId).indexOf(t.id),
      url: t.url,
      title: t.title,
      pinned: t.pinned,
      groupId: t.groupId,
      discarded: t.discarded,
      favIconUrl: t.favIconUrl,
      active: t.active,
      audible: t.audible,
      lastAccessed: t.lastAccessed,
      highlighted: false,
      incognito: false,
      selected: false,
      autoDiscardable: true,
      frozen: false,
    }) as Browser.tabs.Tab;

  const toGroup = (g: GroupRecord): Browser.tabGroups.TabGroup =>
    ({ id: g.id, windowId: g.windowId, title: g.title, color: g.color, collapsed: g.collapsed, shared: false }) as unknown as Browser.tabGroups.TabGroup;

  const getTab = (id: number) => {
    const tab = tabs.get(id);
    if (!tab) throw new Error(`No tab with id: ${id}.`);
    return tab;
  };

  const ids = (value: number | number[]) => (Array.isArray(value) ? value : [value]);

  /** Removes the groups left without tabs, as Chrome does. */
  const dropEmptyGroups = () => {
    for (const id of groups.keys()) {
      if (![...tabs.values()].some((t) => t.groupId === id)) groups.delete(id);
    }
  };

  /** Index right after the last tab of the group in its window. */
  const endOfGroup = (groupId: number, windowId: number) => {
    const list = strip(windowId);
    let end = -1;
    list.forEach((id, i) => {
      if (tabs.get(id)!.groupId === groupId) end = i;
    });
    return end + 1;
  };

  const removeFromStrip = (tab: TabRecord) => {
    const list = strip(tab.windowId);
    list.splice(list.indexOf(tab.id), 1);
  };

  const fakeTabs = {
    async query(q: Browser.tabs.QueryInfo = {}) {
      return [...order.entries()]
        .flatMap(([, list]) => list.map((id) => tabs.get(id)!))
        .filter((t) => q.windowId === undefined || t.windowId === q.windowId)
        .filter((t) => q.currentWindow === undefined || (t.windowId === currentWindowId) === q.currentWindow)
        .filter((t) => q.pinned === undefined || t.pinned === q.pinned)
        .filter((t) => q.groupId === undefined || t.groupId === q.groupId)
        .map(toTab);
    },

    async get(id: number) {
      return toTab(getTab(id));
    },

    async remove(value: number | number[]) {
      for (const id of ids(value)) {
        const tab = getTab(id);
        removeFromStrip(tab);
        tabs.delete(id);
      }
      dropEmptyGroups();
    },

    async group(options: Browser.tabs.GroupOptions): Promise<number> {
      const tabIds = ids(options.tabIds as number | number[]);
      const records = tabIds.map(getTab);
      const first = records[0];
      if (!first) throw new Error('No tabs to group.');
      if (records.some((t) => t.pinned)) throw new Error('Cannot group pinned tabs.');

      let group: GroupRecord;
      let insertAt: number;
      if (options.groupId !== undefined) {
        group = groups.get(options.groupId)!;
        if (!group) throw new Error(`No group with id: ${options.groupId}.`);
        for (const t of records) removeFromStrip(t);
        insertAt = endOfGroup(group.id, group.windowId);
      } else {
        const windowId = options.createProperties?.windowId ?? first.windowId;
        group = { id: nextGroupId++, windowId, title: '', color: 'grey', collapsed: false };
        groups.set(group.id, group);
        insertAt = strip(first.windowId).indexOf(first.id);
        for (const t of records) {
          const list = strip(t.windowId);
          if (t.windowId === windowId && list.indexOf(t.id) < insertAt) insertAt--;
          removeFromStrip(t);
        }
      }
      for (const t of records) {
        t.windowId = group.windowId;
        t.groupId = group.id;
      }
      strip(group.windowId).splice(insertAt, 0, ...records.map((t) => t.id));
      dropEmptyGroups();
      return group.id;
    },

    async ungroup(value: number | number[]) {
      for (const id of ids(value)) {
        const tab = getTab(id);
        if (tab.groupId === NONE) continue;
        const groupId = tab.groupId;
        const list = strip(tab.windowId);
        const index = list.indexOf(tab.id);
        tab.groupId = NONE;
        // As in Chrome: the first tab of the group (or the only one) stays where it is, before the
        // group; the others leave right after the group.
        const first = list.findIndex((id) => tabs.get(id)!.groupId === groupId);
        if (first === -1 || index < first) continue;
        removeFromStrip(tab);
        list.splice(endOfGroup(groupId, tab.windowId), 0, tab.id);
      }
      dropEmptyGroups();
    },

    async move(value: number | number[], props: Browser.tabs.MoveProperties) {
      const moved: Browser.tabs.Tab[] = [];
      let index = props.index;
      for (const id of ids(value)) {
        const tab = getTab(id);
        removeFromStrip(tab);
        if (props.windowId !== undefined) tab.windowId = props.windowId;
        const list = strip(tab.windowId);
        const at = index === -1 || index > list.length ? list.length : index;
        list.splice(at, 0, tab.id);
        if (index !== -1) index = at + 1;
        // As in Chrome: a tab that ends up in the middle of a group joins it, one that leaves drops out of it.
        const pos = list.indexOf(tab.id);
        const left = pos > 0 ? tabs.get(list[pos - 1]!)!.groupId : NONE;
        const right = pos < list.length - 1 ? tabs.get(list[pos + 1]!)!.groupId : NONE;
        if (left !== NONE && left === right) tab.groupId = left;
        else if (tab.groupId !== NONE && left !== tab.groupId && right !== tab.groupId) tab.groupId = NONE;
        moved.push(toTab(tab));
      }
      dropEmptyGroups();
      return moved.length === 1 ? moved[0] : moved;
    },
  };

  const fakeTabGroups = {
    async query(q: Browser.tabGroups.QueryInfo = {}) {
      return [...groups.values()]
        .filter((g) => q.windowId === undefined || g.windowId === q.windowId)
        .filter((g) => q.title === undefined || g.title === q.title)
        .filter((g) => q.color === undefined || g.color === q.color)
        .map(toGroup);
    },
    async get(id: number) {
      const group = groups.get(id);
      if (!group) throw new Error(`No group with id: ${id}.`);
      return toGroup(group);
    },
    async update(id: number, props: Browser.tabGroups.UpdateProperties) {
      const group = groups.get(id);
      if (!group) throw new Error(`No group with id: ${id}.`);
      if (props.title !== undefined) group.title = props.title;
      if (props.color !== undefined) group.color = props.color as GroupColor;
      if (props.collapsed !== undefined) group.collapsed = props.collapsed;
      return toGroup(group);
    },
    /** Moves all the tabs of the group together: the first one ends up at `index`, as in Chrome. */
    async move(id: number, props: Browser.tabGroups.MoveProperties) {
      const group = groups.get(id);
      if (!group) throw new Error(`No group with id: ${id}.`);
      const list = strip(group.windowId);
      const members = list.filter((tabId) => tabs.get(tabId)!.groupId === id);
      for (const tabId of members) list.splice(list.indexOf(tabId), 1);
      const at = props.index === -1 || props.index > list.length ? list.length : props.index;
      list.splice(at, 0, ...members);
      return toGroup(group);
    },
  };

  Object.assign(fakeBrowser.tabs, fakeTabs);
  (fakeBrowser as unknown as { tabGroups: typeof fakeTabGroups }).tabGroups = fakeTabGroups;

  return {
    currentWindowId,

    /** Opens a tab at the end of the window (default: the current window). */
    addTab(tab: NewTab): number {
      const record: TabRecord = {
        id: nextTabId++,
        windowId: tab.windowId ?? currentWindowId,
        url: tab.url,
        title: tab.title ?? tab.url,
        pinned: tab.pinned ?? false,
        groupId: NONE,
        discarded: tab.discarded ?? false,
        active: tab.active ?? false,
        audible: tab.audible ?? false,
        lastAccessed: tab.lastAccessed,
      };
      tabs.set(record.id, record);
      strip(record.windowId).push(record.id);
      return record.id;
    },

    /** Creates a group already opened by the user with the given tabs. */
    async addGroup(title: string, color: GroupColor, tabIds: number[]): Promise<number> {
      const id = await fakeTabs.group({ tabIds: tabIds as [number, ...number[]] });
      await fakeTabGroups.update(id, { title, color: color as Browser.tabGroups.Color });
      return id;
    },

    async closeTab(id: number) {
      await fakeTabs.remove(id);
    },

    /** Groups of the window in the order of the strip, with the titles of their tabs. */
    groupsIn(windowId = currentWindowId) {
      const result: { id: number; title: string; color: string; tabs: string[] }[] = [];
      for (const id of strip(windowId)) {
        const tab = tabs.get(id)!;
        if (tab.groupId === NONE) continue;
        let entry = result.find((g) => g.id === tab.groupId);
        if (!entry) {
          const g = groups.get(tab.groupId)!;
          entry = { id: g.id, title: g.title, color: g.color, tabs: [] };
          result.push(entry);
        }
        entry.tabs.push(tab.title);
      }
      return result;
    },

    /** The window's strip as a list of "title" or "title [group]". */
    layout(windowId = currentWindowId) {
      return strip(windowId).map((id) => {
        const tab = tabs.get(id)!;
        return tab.groupId === NONE ? tab.title : `${tab.title} [${groups.get(tab.groupId)!.title}]`;
      });
    },
  };
}

export type FakeTabStrip = ReturnType<typeof installFakeTabStrip>;
