import { browser, type Browser } from 'wxt/browser';

const NONE = -1;

/** A piece of the tab strip after the pinned tabs: a whole group or a free tab. */
type Block = { groupId: number; tabIds: number[] } | { tabId: number };

const byTitle = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** The window's tab strip without the pinned tabs, in pieces, in the current order. */
async function blocksOf(windowId: number): Promise<{ start: number; blocks: Block[]; tabs: Map<number, Browser.tabs.Tab> }> {
  const all = (await browser.tabs.query({ windowId })).filter((t) => t.id !== undefined).sort((a, b) => a.index - b.index);
  const pinned = all.filter((t) => t.pinned).length;
  const blocks: Block[] = [];
  for (const tab of all.slice(pinned)) {
    const last = blocks.at(-1);
    if (tab.groupId === NONE) blocks.push({ tabId: tab.id! });
    else if (last && 'groupId' in last && last.groupId === tab.groupId) last.tabIds.push(tab.id!);
    else blocks.push({ groupId: tab.groupId, tabIds: [tab.id!] });
  }
  return { start: pinned, blocks, tabs: new Map(all.map((t) => [t.id!, t])) };
}

/**
 * Puts the pieces in the given order, from the left. Every move goes leftward and groups move
 * whole (`tabGroups.move`): a free tab never ends up in the middle of a group and no tab changes
 * group. Inside a group the tabs move only within the group.
 */
async function arrange(start: number, blocks: Block[]): Promise<void> {
  // A tab already in its place stays still: moved onto itself, the only tab of a group could otherwise leave it.
  const moveTab = async (tabId: number, index: number) => {
    if ((await browser.tabs.get(tabId)).index !== index) await browser.tabs.move(tabId, { index });
  };
  let index = start;
  for (const block of blocks) {
    if ('tabId' in block) {
      await moveTab(block.tabId, index);
      index++;
      continue;
    }
    await browser.tabGroups.move(block.groupId, { index });
    for (const [i, tabId] of block.tabIds.entries()) await moveTab(tabId, index + i);
    index += block.tabIds.length;
  }
}

/**
 * "Sort groups A to Z": the groups of the window in alphabetical order right after the pinned tabs (those
 * without a name at the end), then the free tabs in their order. The tabs inside the groups do not move.
 */
export async function sortGroups(windowId: number): Promise<void> {
  const { start, blocks } = await blocksOf(windowId);
  const groups = blocks.filter((b) => 'groupId' in b);
  const titles = new Map((await browser.tabGroups.query({ windowId })).map((g) => [g.id, g.title ?? '']));
  groups.sort((a, b) => {
    const [x, y] = [titles.get(a.groupId) ?? '', titles.get(b.groupId) ?? ''];
    return (x === '' ? 1 : 0) - (y === '' ? 1 : 0) || byTitle(x, y);
  });
  await arrange(start, [...groups, ...blocks.filter((b) => 'tabId' in b)]);
}

/**
 * "Sort tabs A to Z": by title, the tabs inside each group and the free tabs among themselves, which stay
 * in the same places between the groups. The groups stay where they are and no tab changes group; the pinned ones do not move.
 */
export async function sortTabs(windowId: number): Promise<void> {
  const { start, blocks, tabs } = await blocksOf(windowId);
  const title = (id: number) => tabs.get(id)!.title ?? '';
  const compare = (a: number, b: number) => byTitle(title(a), title(b));
  const free = blocks.flatMap((b) => ('tabId' in b ? [b.tabId] : [])).sort(compare);
  let next = 0;
  const sorted = blocks.map((b): Block => ('tabId' in b ? { tabId: free[next++]! } : { ...b, tabIds: [...b.tabIds].sort(compare) }));
  await arrange(start, sorted);
}
