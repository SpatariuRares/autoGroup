import { browser, type Browser } from 'wxt/browser';
import { loadSettings, type Settings } from '../settings';
import type { Proposal, ProposedGroup } from '../shared/types';
import { createColorAssigner } from './colors';
import { groupByDomain } from './domain-grouping';
import { selectCandidateTabs, type CandidateTab } from './tab-selection';

/** Tutto ciò che serve per calcolare una proposta, letto dal browser in un colpo solo. */
export interface ProposalInputs {
  windowId: number;
  candidates: CandidateTab[];
  openGroups: Browser.tabGroups.TabGroup[];
  settings: Settings;
}

export async function collectInputs(windowId: number): Promise<ProposalInputs> {
  const [tabs, openGroups, settings] = await Promise.all([
    browser.tabs.query({ windowId }),
    browser.tabGroups.query({ windowId }),
    loadSettings(),
  ]);
  return { windowId, candidates: selectCandidateTabs(tabs, settings.excludedDomains), openGroups, settings };
}

/**
 * Impronta delle tab candidate (ID e URL) e delle impostazioni: se cambia, una proposta salvata non è
 * più attuale. Il titolo resta fuori perché cambia spesso da solo (contatori come "(3) Posta").
 */
export function signatureOf(inputs: ProposalInputs): string {
  return JSON.stringify([inputs.candidates.map((t) => [t.tabId, t.url]), inputs.settings]);
}

/**
 * Calcola la proposta. Oggi c'è solo l'ultimo livello della tabella dei fallback (raggruppamento
 * per dominio); la pipeline AI (AG-06, AG-08) si inserirà qui, prima di questo livello, e userà
 * le stesse regole sui gruppi e lo stesso assegnatore di colori.
 */
export function buildProposal(inputs: ProposalInputs): Proposal {
  const colors = createColorAssigner(inputs.openGroups.map((g) => g.color));

  const groups: ProposedGroup[] = groupByDomain(inputs.candidates, inputs.settings.minTabs).map((group, i) => ({
    id: `g${i + 1}`,
    name: group.name,
    color: colors.next(),
    provenance: 'domain',
    tabs: group.tabs.map(({ tabId, title, url, favIconUrl }) => ({ tabId, title, url, favIconUrl })),
  }));

  return { windowId: inputs.windowId, createdAt: Date.now(), signature: signatureOf(inputs), groups, warnings: [] };
}
