import { browser } from 'wxt/browser';
import type { UndoSnapshot } from '../shared/types';
import { TAB_GROUP_ID_NONE } from './tab-selection';

/** Foto delle tab coinvolte: per ognuna finestra, posizione e gruppo (o nessuno). */
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
 * Riporta ogni tab ancora aperta nel suo gruppo originale (o fuori da ogni gruppo) e nella sua posizione.
 * Le tab chiuse vengono ignorate, quelle aperte dopo non vengono toccate e i gruppi non vengono rinominati.
 * I gruppi creati dall'operazione spariscono da soli quando restano senza tab.
 */
export async function restoreSnapshot(snapshot: UndoSnapshot): Promise<void> {
  const current = new Map<number, { groupId: number }>();
  for (const tab of await browser.tabs.query({})) {
    if (tab.id !== undefined) current.set(tab.id, { groupId: tab.groupId ?? TAB_GROUP_ID_NONE });
  }
  const openGroups = new Set((await browser.tabGroups.query({})).map((g) => g.id));
  const entries = snapshot.tabs.filter((t) => current.has(t.tabId)).sort((a, b) => a.index - b.index);
  if (entries.length === 0) return;

  // 1. Fuori dai gruppi in cui l'operazione le ha messe.
  const toUngroup = entries.filter((t) => current.get(t.tabId)!.groupId !== t.groupId).map((t) => t.tabId);
  if (toUngroup.length > 0) await browser.tabs.ungroup(toUngroup as [number, ...number[]]);

  // 2. Nelle posizioni originali, da sinistra a destra, così ogni indice si riferisce alla barra già ricostruita.
  for (const entry of entries) {
    const windowTabs = await browser.tabs.query({ windowId: entry.windowId });
    const index = Math.min(entry.index, windowTabs.length - 1);
    await browser.tabs.move(entry.tabId, { windowId: entry.windowId, index });
  }

  // 3. Di nuovo nei gruppi originali, se esistono ancora.
  const byGroup = new Map<number, number[]>();
  for (const entry of entries) {
    if (entry.groupId === TAB_GROUP_ID_NONE || !openGroups.has(entry.groupId)) continue;
    byGroup.set(entry.groupId, [...(byGroup.get(entry.groupId) ?? []), entry.tabId]);
  }
  for (const [groupId, tabIds] of byGroup) {
    await browser.tabs.group({ groupId, tabIds: tabIds as [number, ...number[]] });
  }

  // 4. Una tab spostata nel mezzo di un gruppo altrui ci entra (comportamento di Chrome): la si toglie.
  const after = await browser.tabs.query({});
  const intruders = after
    .filter((t) => entries.some((e) => e.tabId === t.id && e.groupId === TAB_GROUP_ID_NONE))
    .filter((t) => (t.groupId ?? TAB_GROUP_ID_NONE) !== TAB_GROUP_ID_NONE)
    .map((t) => t.id!);
  if (intruders.length > 0) await browser.tabs.ungroup(intruders as [number, ...number[]]);
}
