import { categoryKey, loadSettings, saveSettings, SettingsError, type Settings } from '../settings';
import type { OrganizerState, Proposal, RememberOffer } from '../shared/types';
import { keepCurrent } from './proposal-builder';
import { siteToRemember } from './site-rules';

interface RememberResult {
  proposal: Proposal;
  notice: NonNullable<OrganizerState['notice']>;
}

/**
 * La categoria e il sito che "Metti sempre qui" salverebbe per una tab della proposta: il sito della
 * regola che oggi la decide, oppure, senza regole, il suo dominio. Solo per i gruppi che sono una
 * categoria: della lista, o un gruppo aperto con lo stesso nome.
 */
function rememberable(proposal: Proposal, tabId: number, settings: Settings) {
  const group = proposal.groups.find((g) => g.tabs.some((t) => t.tabId === tabId));
  if (!group || (group.provenance !== 'list' && group.provenance !== 'existing')) return null;
  const category = settings.categories.find((c) => categoryKey(c.name) === categoryKey(group.name));
  const tab = group.tabs.find((t) => t.tabId === tabId)!;
  const site = siteToRemember(tab.url, settings.categories, settings.categorySites);
  if (!category || !site) return null;
  return { group, category, site };
}

/** L'offerta "Metti sempre qui" dopo aver messo una tab in un gruppo; nessuna se il sito ci va già. */
export function rememberOffer(proposal: Proposal, tabId: number, settings: Settings): RememberOffer | null {
  const found = rememberable(proposal, tabId, settings);
  if (!found || settings.categorySites[found.category.id]?.includes(found.site)) return null;
  return { tabId, site: found.site, category: found.category.name };
}

/**
 * "Metti sempre qui": la tab andrà sempre nella categoria del gruppo in cui si trova ora nella
 * proposta (vedi `rememberable`); il sito viene tolto dalle altre categorie. Se la proposta era
 * attuale resta attuale.
 */
export async function rememberTabSite(proposal: Proposal, tabId: number): Promise<RememberResult | null> {
  const settings = await loadSettings();
  const found = rememberable(proposal, tabId, settings);
  if (!found) return null;
  const { group, category, site } = found;
  const { categories, categorySites } = settings;

  const from = categories.find((c) => c.id !== category.id && categorySites[c.id]?.includes(site));
  if (!categorySites[category.id]?.includes(site)) {
    const next = Object.fromEntries(Object.entries(categorySites).map(([id, sites]) => [id, sites.filter((s) => s !== site)]));
    next[category.id] = [...(next[category.id] ?? []), site];
    try {
      proposal = await keepCurrent(proposal, async () => {
        await saveSettings({ categorySites: next });
        return proposal;
      });
    } catch (err) {
      if (err instanceof SettingsError) return { proposal, notice: { key: err.messageKey } };
      throw err;
    }
  }

  const groups = proposal.groups.map((g) =>
    g.id === group.id ? { ...g, tabs: g.tabs.map((t) => (t.tabId === tabId ? { ...t, rule: site } : t)) } : g,
  );
  const notice = from
    ? { key: 'panelSiteMoved', arg: [site, from.name, category.name] }
    : { key: 'panelSiteRemembered', arg: [site, category.name] };
  return { proposal: { ...proposal, groups }, notice };
}
