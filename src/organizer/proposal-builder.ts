import { browser, type Browser } from 'wxt/browser';
import { nanoAvailability, type NanoAvailability } from '../ai/nano-generator';
import {
  hasDescriptionPermission,
  hasHostPermission,
  isProviderConfigured,
  loadApiKey,
  NANO_PRESET,
  loadSettings,
  type ProviderRole,
  type ProviderSettings,
  type Settings,
} from '../settings';
import type { Proposal } from '../shared/types';
import { domainGroups, runPipeline } from './pipeline';
import type { Stopwatch } from './stopwatch';
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
  /** Stato di Gemini Nano; letto solo se l'utente ha scelto Nano come Generatore e la modalità AI. */
  nano: NanoAvailability;
  /** Vero se l'opzione "descrizione delle pagine" è accesa e il permesso <all_urls> è concesso. */
  readDescriptions: boolean;
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
  const nano = settings.mode === 'ai' && settings.generator.preset === NANO_PRESET ? await nanoAvailability() : 'unavailable';
  const readDescriptions = settings.readDescriptions && (await hasDescriptionPermission());
  return {
    windowId,
    candidates: selectCandidateTabs(tabs, settings.excludedDomains),
    openGroups,
    settings,
    classifier,
    generator,
    nano,
    readDescriptions,
  };
}

/**
 * Impronta delle tab candidate (ID e URL), dei gruppi aperti, delle impostazioni e della
 * disponibilità dei provider: se cambia, una proposta salvata non è più attuale. Il titolo resta
 * fuori perché cambia spesso da solo (contatori come "(3) Posta"); le chiavi API non ci sono mai.
 */
export function signatureOf(inputs: ProposalInputs): string {
  // Il raggruppamento automatico non cambia la proposta: accenderlo o spegnerlo non la rende superata.
  const { autoGroupSites: _, ...settings } = inputs.settings;
  return JSON.stringify([
    inputs.candidates.map((t) => [t.tabId, t.url]),
    inputs.openGroups.map((g) => [g.id, g.title, g.color]),
    settings,
    inputs.classifier.usable,
    inputs.generator.usable,
    inputs.nano,
    inputs.readDescriptions,
  ]);
}

/**
 * Calcola la proposta passando dalla pipeline (livelli AI e raggruppamento per dominio).
 * Con `clock` la proposta riporta anche la durata di ogni fase.
 */
export async function buildProposal(inputs: ProposalInputs, signal?: AbortSignal, clock?: Stopwatch): Promise<Proposal> {
  const { groups, warnings } = await runPipeline(inputs, signal, clock);
  const proposal: Proposal = { windowId: inputs.windowId, createdAt: Date.now(), signature: signatureOf(inputs), groups, warnings };
  return clock ? { ...proposal, timings: clock.timings() } : proposal;
}

/**
 * Anteprima per sito: il raggruppamento per dominio delle stesse tab, senza AI né pagine lette.
 * Ha la stessa impronta della proposta AI che sta per arrivare, quindi se l'utente la sceglie resta attuale.
 */
export function buildPreview(inputs: ProposalInputs): Proposal {
  return { windowId: inputs.windowId, createdAt: Date.now(), signature: signatureOf(inputs), groups: domainGroups(inputs), warnings: [] };
}
