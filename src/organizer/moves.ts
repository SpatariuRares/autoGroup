import { browser, type Browser } from 'wxt/browser';

const NONE = -1;

/*
 * Spostamenti del drag and drop del pannello, sui gruppi già aperti e sulle tab senza gruppo.
 * Le tab fissate non si spostano mai. Dove si può, ogni spostamento va verso sinistra: con
 * `tabs.move` e `tabGroups.move` l'indice di arrivo è allora senza ambiguità.
 */

async function stripOf(windowId: number): Promise<Browser.tabs.Tab[]> {
  return (await browser.tabs.query({ windowId })).filter((t) => t.id !== undefined).sort((a, b) => a.index - b.index);
}

/** Indice di arrivo per mettere la tab subito prima di `before`, contando che lei stessa esce dalla barra. */
const indexBefore = (tab: Browser.tabs.Tab, before: Browser.tabs.Tab) => (tab.index < before.index ? before.index - 1 : before.index);

/** Indice di arrivo per mettere la tab subito dopo `after`, come sopra. */
const indexAfter = (tab: Browser.tabs.Tab, after: Browser.tabs.Tab) => (tab.index <= after.index ? after.index : after.index + 1);

/**
 * Sposta una tab non fissata in un gruppo aperto della sua finestra (`groupId`) o fuori da ogni gruppo
 * (`null`), subito prima di `beforeTabId` o, con `null`, in fondo al gruppo (o dopo l'ultima tab senza
 * gruppo). `beforeTabId` deve stare nel gruppo di arrivo, o essere senza gruppo per `groupId` null;
 * altrimenti non succede nulla.
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

  // Prima nel gruppo giusto: `tabs.group` la mette in fondo al gruppo, `tabs.ungroup` subito dopo il suo vecchio gruppo.
  if (tab.groupId !== target) {
    if (groupId !== null) await browser.tabs.group({ tabIds: [tabId], groupId });
    else await browser.tabs.ungroup([tabId]);
    tab = await browser.tabs.get(tabId);
  }

  const strip = await stripOf(windowId);
  const at = (id: number) => strip.find((t) => t.id === id)!;
  tab = at(tabId);
  if (before) {
    // Con la tab di arrivo come vicina a destra la tab resta nel gruppo giusto (o senza gruppo).
    const index = indexBefore(tab, at(before.id!));
    if (index !== tab.index) await browser.tabs.move(tabId, { index });
    return;
  }
  const last = strip.filter((t) => !t.pinned && t.groupId === target).at(-1);
  if (!last || last.id === tabId) return;
  await browser.tabs.move(tabId, { index: indexAfter(tab, last) });
  // In fondo al gruppo la tab ha a destra un'altra tab: se Chrome l'ha tolta dal gruppo, ci torna (in fondo).
  if (groupId !== null && (await browser.tabs.get(tabId)).groupId !== groupId) await browser.tabs.group({ tabIds: [tabId], groupId });
}

/** I gruppi della barra in ordine, ognuno con le sue tab. */
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
 * Sposta un gruppo aperto, intero, subito prima del gruppo `beforeGroupId` della stessa finestra o,
 * con `null`, subito dopo l'ultimo gruppo. Non entra mai in un altro gruppo. Verso destra si spostano
 * invece verso sinistra, prima di lui, i pezzi che deve scavalcare (gruppi interi e tab senza gruppo).
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
  // Tutto quello che sta tra la fine del gruppo e l'inizio del gruppo di arrivo (o la fine dell'ultimo gruppo).
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
