import { browser, type Browser } from 'wxt/browser';
import { nanoAvailability, type NanoAvailability } from '../ai/nano-generator';
import {
  hasHostPermission,
  isProviderConfigured,
  loadApiKey,
  loadSettings,
  type ProviderRole,
  type ProviderSettings,
  type Settings,
} from '../settings';
import type { Proposal } from '../shared/types';
import { runPipeline } from './pipeline';
import { selectCandidateTabs, type CandidateTab } from './tab-selection';

/** Un provider configurato dall'utente, con quello che serve per usarlo. */
export interface ProviderInput {
  settings: ProviderSettings;
  /** Mai salvata nello stato né nell'impronta. */
  apiKey: string;
  /** Vero se il provider è configurato e il suo permesso host è stato concesso. */
  usable: boolean;
  /** Vero se il provider è configurato ma manca il permesso host. */
  missingPermission: boolean;
}

/** Tutto ciò che serve per calcolare una proposta, letto dal browser in un colpo solo. */
export interface ProposalInputs {
  windowId: number;
  candidates: CandidateTab[];
  openGroups: Browser.tabGroups.TabGroup[];
  settings: Settings;
  classifier: ProviderInput;
  generator: ProviderInput;
  /** Stato di Gemini Nano; letto solo se il Generatore configurato non è utilizzabile. */
  nano: NanoAvailability;
}

async function providerInput(role: ProviderRole, settings: ProviderSettings): Promise<ProviderInput> {
  const configured = isProviderConfigured(role, settings);
  const [apiKey, permitted] = await Promise.all([
    loadApiKey(role),
    configured ? hasHostPermission(settings.baseUrl) : Promise.resolve(false),
  ]);
  return { settings, apiKey, usable: configured && permitted, missingPermission: configured && !permitted };
}

export async function collectInputs(windowId: number): Promise<ProposalInputs> {
  const [tabs, openGroups, settings] = await Promise.all([
    browser.tabs.query({ windowId }),
    browser.tabGroups.query({ windowId }),
    loadSettings(),
  ]);
  const [classifier, generator] = await Promise.all([
    providerInput('classifier', settings.classifier),
    providerInput('generator', settings.generator),
  ]);
  const nano = generator.usable ? 'unavailable' : await nanoAvailability();
  return {
    windowId,
    candidates: selectCandidateTabs(tabs, settings.excludedDomains),
    openGroups,
    settings,
    classifier,
    generator,
    nano,
  };
}

/**
 * Impronta delle tab candidate (ID e URL), dei gruppi aperti, delle impostazioni e della
 * disponibilità dei provider: se cambia, una proposta salvata non è più attuale. Il titolo resta
 * fuori perché cambia spesso da solo (contatori come "(3) Posta"); le chiavi API non ci sono mai.
 */
export function signatureOf(inputs: ProposalInputs): string {
  return JSON.stringify([
    inputs.candidates.map((t) => [t.tabId, t.url]),
    inputs.openGroups.map((g) => [g.id, g.title, g.color]),
    inputs.settings,
    inputs.classifier.usable,
    inputs.generator.usable,
    inputs.nano,
  ]);
}

/** Calcola la proposta passando dalla pipeline (livelli AI e raggruppamento per dominio). */
export async function buildProposal(inputs: ProposalInputs, signal?: AbortSignal): Promise<Proposal> {
  const { groups, warnings } = await runPipeline(inputs, signal);
  return { windowId: inputs.windowId, createdAt: Date.now(), signature: signatureOf(inputs), groups, warnings };
}
