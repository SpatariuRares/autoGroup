import { categoryKey, loadSettings, saveSettings, SettingsError } from '../settings';
import type { OrganizerState, Proposal } from '../shared/types';
import { collectInputs, signatureOf } from './proposal-builder';
import { siteToRemember } from './site-rules';

interface RememberResult {
  proposal: Proposal;
  notice: NonNullable<OrganizerState['notice']>;
}

/**
 * "Metti sempre qui": la tab andrà sempre nella categoria del gruppo in cui si trova ora nella
 * proposta. Si salva il sito della regola che oggi la decide (togliendolo dalla sua categoria),
 * oppure, senza regole, il suo dominio. Vale solo per i gruppi che sono una categoria: della lista,
 * o un gruppo aperto con lo stesso nome. Se la proposta era attuale resta attuale, con la nuova impronta.
 */
export async function rememberTabSite(proposal: Proposal, tabId: number): Promise<RememberResult | null> {
  const group = proposal.groups.find((g) => g.tabs.some((t) => t.tabId === tabId));
  if (!group || (group.provenance !== 'list' && group.provenance !== 'existing')) return null;
  const { categories, categorySites } = await loadSettings();
  const category = categories.find((c) => categoryKey(c.name) === categoryKey(group.name));
  const tab = group.tabs.find((t) => t.tabId === tabId)!;
  const site = siteToRemember(tab.url, categories, categorySites);
  if (!category || !site) return null;

  const from = categories.find((c) => c.id !== category.id && categorySites[c.id]?.includes(site));
  if (!categorySites[category.id]?.includes(site)) {
    const next = Object.fromEntries(Object.entries(categorySites).map(([id, sites]) => [id, sites.filter((s) => s !== site)]));
    next[category.id] = [...(next[category.id] ?? []), site];
    const wasCurrent = proposal.signature === signatureOf(await collectInputs(proposal.windowId));
    try {
      await saveSettings({ categorySites: next });
    } catch (err) {
      if (err instanceof SettingsError) return { proposal, notice: { key: err.messageKey } };
      throw err;
    }
    if (wasCurrent) proposal = { ...proposal, signature: signatureOf(await collectInputs(proposal.windowId)) };
  }

  const groups = proposal.groups.map((g) =>
    g.id === group.id ? { ...g, tabs: g.tabs.map((t) => (t.tabId === tabId ? { ...t, rule: site } : t)) } : g,
  );
  const notice = from
    ? { key: 'panelSiteMoved', arg: [site, from.name, category.name] }
    : { key: 'panelSiteRemembered', arg: [site, category.name] };
  return { proposal: { ...proposal, groups }, notice };
}
