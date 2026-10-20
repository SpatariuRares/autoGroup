import { browser, type Browser } from 'wxt/browser';

const NONE = -1;

/** Un pezzo della barra dopo le tab fissate: un gruppo intero oppure una tab libera. */
type Block = { groupId: number; tabIds: number[] } | { tabId: number };

const byTitle = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/** La barra della finestra senza le tab fissate, in pezzi, nell'ordine attuale. */
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
 * Mette i pezzi nell'ordine dato, da sinistra. Ogni spostamento va verso sinistra e i gruppi si
 * spostano interi (`tabGroups.move`): una tab libera non finisce mai in mezzo a un gruppo e nessuna
 * tab cambia gruppo. Dentro un gruppo le tab si spostano solo entro il gruppo.
 */
async function arrange(start: number, blocks: Block[]): Promise<void> {
  // Una tab già al suo posto resta ferma: spostata su sé stessa, l'unica tab di un gruppo potrebbe uscirne.
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
 * "Gruppi A-Z": i gruppi della finestra in ordine alfabetico subito dopo le tab fissate (quelli senza
 * nome in fondo), poi le tab libere nel loro ordine. Le tab dentro i gruppi non si muovono.
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
 * "Tab A-Z": per titolo le tab dentro ogni gruppo e le tab libere tra loro, che restano negli stessi
 * posti tra i gruppi. I gruppi restano dove sono e nessuna tab cambia gruppo; le fissate non si muovono.
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
